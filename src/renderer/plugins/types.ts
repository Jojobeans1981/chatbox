export type PluginAuthType = 'none' | 'api_key' | 'oauth2'
export type PluginContentRating = 'everyone' | 'teen' | 'adult'

export interface PluginToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  rendersUI: boolean
  completionEvent?: string
}

export interface PluginManifest {
  id: string
  name: string
  description: string
  version: string
  iframeUrl: string
  iconUrl?: string
  authType: PluginAuthType
  tools: PluginToolDefinition[]
  contentRating: PluginContentRating
  maxStateUpdatesPerSecond?: number
}

export interface PluginOpenResult {
  pluginId: string
  sessionId: string
  capabilityToken: string
  allowedTools: string[]
  pendingInvocation?: {
    toolName: string
    params: Record<string, unknown>
  }
  stateSummary?: string
}

export interface PluginToolExecutionResult {
  ok: boolean
  message: string
  plugin?: PluginOpenResult
  data?: Record<string, unknown>
}

export interface PluginCredentialPayload {
  type: 'api_key'
  secret: string
  label?: string
}

export type PlatformToPluginMessage =
  | {
      type: 'tool_invoke'
      pluginId: string
      sessionId: string
      capabilityToken: string
      invocationId: string
      toolName: string
      params: Record<string, unknown>
    }
  | {
      type: 'ping'
      pluginId: string
      sessionId: string
      capabilityToken: string
    }
  | {
      type: 'credential_state'
      pluginId: string
      sessionId: string
      capabilityToken: string
      credential: PluginCredentialPayload | null
    }

export type PluginToPlatformMessage =
  | {
      type: 'tool_result'
      pluginId: string
      sessionId: string
      capabilityToken: string
      invocationId: string
      result: unknown
      status: 'success' | 'error'
    }
  | {
      type: 'state_update'
      pluginId: string
      sessionId: string
      capabilityToken: string
      summary: string
      state?: Record<string, unknown>
    }
  | {
      type: 'completion'
      pluginId: string
      sessionId: string
      capabilityToken: string
      summary: string
    }
  | {
      type: 'ready'
      pluginId: string
      sessionId: string
      capabilityToken: string
    }
  | {
      type: 'credential_update'
      pluginId: string
      sessionId: string
      capabilityToken: string
      credential: PluginCredentialPayload | null
    }
  | {
      type: 'pong'
      pluginId: string
      sessionId: string
      capabilityToken: string
    }
