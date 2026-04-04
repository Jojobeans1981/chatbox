import { tool } from 'ai'
import { uniqueId } from 'lodash'
import z from 'zod'
import type { PluginSession } from '@shared/types'
import * as chatStore from '@/stores/chatStore'
import { getPluginById, getSafeBuiltinPlugins } from './manifests'
import { pluginBridgeController } from './bridge-controller'
import type { PluginManifest, PluginToolExecutionResult } from './types'

const toolDescriptionPrefix = `
Use these tools to open and work with embedded learning apps inside Chatbox.

Important:
- Use these tools only when the user clearly wants to interact with the matching app.
- Chess supports ongoing stateful play across multiple turns.
- Flashcards can open a lightweight study deck panel inline in the chat.
- Quiz Studio requires the teacher to unlock editing inside the embedded app before teacher-only tools will work.
`

function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  const type = typeof schema.type === 'string' ? schema.type : undefined
  const description = typeof schema.description === 'string' ? schema.description : undefined

  if (type === 'object') {
    const properties = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {}
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : [])
    const shape: Record<string, z.ZodTypeAny> = {}

    for (const [key, value] of Object.entries(properties)) {
      const field = jsonSchemaToZod(value)
      shape[key] = required.has(key) ? field : field.optional()
    }

    const objectSchema = z.object(shape)
    return description ? objectSchema.describe(description) : objectSchema
  }

  if (type === 'string') {
    const values = Array.isArray(schema.enum) ? schema.enum.filter((value): value is string => typeof value === 'string') : null
    const stringSchema =
      values && values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string()
    return description ? stringSchema.describe(description) : stringSchema
  }

  if (type === 'number') {
    const numberSchema = z.number()
    return description ? numberSchema.describe(description) : numberSchema
  }

  if (type === 'integer') {
    const integerSchema = z.number().int()
    return description ? integerSchema.describe(description) : integerSchema
  }

  if (type === 'boolean') {
    const booleanSchema = z.boolean()
    return description ? booleanSchema.describe(description) : booleanSchema
  }

  const anySchema = z.any()
  return description ? anySchema.describe(description) : anySchema
}

async function updatePluginSessionState(
  sessionId: string,
  pluginSessionId: string,
  updater: (pluginSession: PluginSession) => PluginSession
) {
  await chatStore.updateSession(sessionId, (session) => {
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    return {
      ...session,
      activePlugins: (session.activePlugins ?? []).map((pluginSession) =>
        pluginSession.id === pluginSessionId ? updater(pluginSession) : pluginSession
      ),
    }
  })
}

async function ensurePluginSession(sessionId: string, plugin: PluginManifest) {
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  const existing = [...(session.activePlugins ?? [])]
    .reverse()
    .find((pluginSession) => pluginSession.pluginId === plugin.id && pluginSession.status === 'active')

  if (existing) {
    return existing
  }

  const pluginSession = {
    id: uniqueId(`${plugin.id}_session_`),
    pluginId: plugin.id,
    capabilityToken: uniqueId(`${plugin.id}_cap_`),
    allowedTools: plugin.tools.map((toolDefinition) => toolDefinition.name),
    stateSummary: `${plugin.name} ready.`,
    stateSnapshot: {},
    status: 'active' as const,
    createdAt: Date.now(),
  }

  await chatStore.updateSession(sessionId, (current) => {
    if (!current) {
      throw new Error(`Session ${sessionId} not found`)
    }

    return {
      ...current,
      activePlugins: [...(current.activePlugins ?? []), pluginSession],
    }
  })

  return pluginSession
}

async function executePluginTool(
  sessionId: string,
  pluginId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<PluginToolExecutionResult> {
  const plugin = getPluginById(pluginId)
  if (!plugin) {
    throw new Error(`Unknown plugin: ${pluginId}`)
  }

  const toolDefinition = plugin.tools.find((definition) => definition.name === toolName)
  if (!toolDefinition) {
    throw new Error(`Unknown plugin tool: ${pluginId}/${toolName}`)
  }

  const pluginSession = await ensurePluginSession(sessionId, plugin)

  if (toolDefinition.rendersUI) {
    return {
      ok: true,
      message: `Opened ${plugin.name} in the chat.`,
      plugin: {
        pluginId,
        sessionId: pluginSession.id,
        capabilityToken: pluginSession.capabilityToken,
        allowedTools: pluginSession.allowedTools,
        pendingInvocation: {
          toolName,
          params: input,
        },
        stateSummary: pluginSession.stateSummary,
      },
      data: {
        sessionState: pluginSession.stateSnapshot ?? {},
      },
    }
  }

  const result = await pluginBridgeController.invoke(
    pluginSession.id,
    {
      type: 'tool_invoke',
      pluginId,
      sessionId: pluginSession.id,
      capabilityToken: pluginSession.capabilityToken,
      invocationId: uniqueId(`${pluginId}_${toolName}_`),
      toolName,
      params: input,
    },
    15000
  )

  return {
    ok: true,
    message: `${plugin.name} responded successfully.`,
    data: (typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : { value: result }),
  }
}

export function getPluginToolInstructions() {
  const plugins = getSafeBuiltinPlugins()
  const lines = plugins.flatMap((plugin) => [
    `## ${plugin.name}`,
    plugin.description,
    ...plugin.tools.map((toolDefinition) => `- ${plugin.id}__${toolDefinition.name}: ${toolDefinition.description}`),
    '',
  ])

  return `${toolDescriptionPrefix}\n${lines.join('\n')}`
}

export function getPluginContextSummary(activePlugins: Array<{
  pluginId: string
  stateSummary: string
  status: string
}>) {
  if (!activePlugins.length) {
    return ''
  }

  const summaries = activePlugins.map((pluginSession) => {
    const pluginName = getPluginById(pluginSession.pluginId)?.name ?? pluginSession.pluginId
    return `- ${pluginName}: ${pluginSession.stateSummary} (status: ${pluginSession.status})`
  })

  return `Active embedded apps:\n${summaries.join('\n')}`
}

export function buildPluginToolSet(sessionId: string) {
  const tools = Object.fromEntries(
    getSafeBuiltinPlugins().flatMap((plugin) =>
      plugin.tools.map((toolDefinition) => [
        `${plugin.id}__${toolDefinition.name}`,
        tool({
          description: `[${plugin.name}] ${toolDefinition.description}`,
          inputSchema: jsonSchemaToZod(toolDefinition.parameters) as never,
          execute: async (input) => {
            return await executePluginTool(
              sessionId,
              plugin.id,
              toolDefinition.name,
              (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
            )
          },
        }),
      ])
    )
  )

  return {
    description: getPluginToolInstructions(),
    tools,
  }
}

export async function persistPluginStateUpdate(
  sessionId: string,
  pluginSessionId: string,
  summary: string,
  state?: Record<string, unknown>
) {
  await updatePluginSessionState(sessionId, pluginSessionId, (pluginSession) => ({
    ...pluginSession,
    stateSummary: summary,
    stateSnapshot: state ?? pluginSession.stateSnapshot,
  }))
}

export async function persistPluginCompletion(sessionId: string, pluginSessionId: string, summary: string) {
  await updatePluginSessionState(sessionId, pluginSessionId, (pluginSession) => ({
    ...pluginSession,
    stateSummary: summary,
    status: 'completed',
    completedAt: Date.now(),
  }))
}
