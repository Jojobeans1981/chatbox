import type { PlatformToPluginMessage, PluginToPlatformMessage } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasBridgeIdentity(
  value: Record<string, unknown>,
  expected: { pluginId: string; sessionId: string; capabilityToken: string }
) {
  return (
    value.pluginId === expected.pluginId &&
    value.sessionId === expected.sessionId &&
    value.capabilityToken === expected.capabilityToken
  )
}

export function parsePluginToPlatformMessage(
  value: unknown,
  expected: { pluginId: string; sessionId: string; capabilityToken: string }
): PluginToPlatformMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }
  if (!hasBridgeIdentity(value, expected)) {
    return null
  }

  switch (value.type) {
    case 'ready':
    case 'pong':
      return value as PluginToPlatformMessage
    case 'credential_update':
      if (
        value.credential === null ||
        (isRecord(value.credential) &&
          value.credential.type === 'api_key' &&
          typeof value.credential.secret === 'string' &&
          (value.credential.label === undefined || typeof value.credential.label === 'string'))
      ) {
        return value as PluginToPlatformMessage
      }
      return null
    case 'tool_result':
      if (
        typeof value.invocationId === 'string' &&
        (value.status === 'success' || value.status === 'error')
      ) {
        return value as PluginToPlatformMessage
      }
      return null
    case 'state_update':
    case 'completion':
      return typeof value.summary === 'string' ? (value as PluginToPlatformMessage) : null
    default:
      return null
  }
}

export function isValidToolInvokeMessage(
  value: unknown,
  expected: { pluginId: string; sessionId: string; capabilityToken: string; allowedTools: string[] }
): value is Extract<PlatformToPluginMessage, { type: 'tool_invoke' }> {
  return (
    isRecord(value) &&
    value.type === 'tool_invoke' &&
    hasBridgeIdentity(value, expected) &&
    typeof value.invocationId === 'string' &&
    typeof value.toolName === 'string' &&
    expected.allowedTools.includes(value.toolName) &&
    isRecord(value.params)
  )
}

export function isValidPingMessage(
  value: unknown,
  expected: { pluginId: string; sessionId: string; capabilityToken: string }
): value is Extract<PlatformToPluginMessage, { type: 'ping' }> {
  return isRecord(value) && value.type === 'ping' && hasBridgeIdentity(value, expected)
}

export function isValidCredentialStateMessage(
  value: unknown,
  expected: { pluginId: string; sessionId: string; capabilityToken: string }
): value is Extract<PlatformToPluginMessage, { type: 'credential_state' }> {
  return (
    isRecord(value) &&
    value.type === 'credential_state' &&
    hasBridgeIdentity(value, expected) &&
    (value.credential === null ||
      (isRecord(value.credential) &&
        value.credential.type === 'api_key' &&
        typeof value.credential.secret === 'string' &&
        (value.credential.label === undefined || typeof value.credential.label === 'string')))
  )
}
