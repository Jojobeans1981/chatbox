import storage from '@/storage'
import type { PluginCredentialPayload } from './types'

const pluginCredentialStorageKey = (pluginSessionId: string) => `plugin-credentials:${pluginSessionId}`

export async function loadPluginCredential(pluginSessionId: string): Promise<PluginCredentialPayload | null> {
  const raw = await storage.getBlob(pluginCredentialStorageKey(pluginSessionId)).catch(() => null)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PluginCredentialPayload>
    if (parsed.type === 'api_key' && typeof parsed.secret === 'string') {
      return {
        type: 'api_key',
        secret: parsed.secret,
        label: typeof parsed.label === 'string' ? parsed.label : undefined,
      }
    }
    if (parsed.type === 'oauth2' && typeof parsed.accessToken === 'string') {
      return {
        type: 'oauth2',
        accessToken: parsed.accessToken,
        refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
        expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined,
        label: typeof parsed.label === 'string' ? parsed.label : undefined,
        scopes: Array.isArray(parsed.scopes) ? parsed.scopes.filter((scope): scope is string => typeof scope === 'string') : undefined,
      }
    }
  } catch {
    return null
  }

  return null
}

export async function savePluginCredential(pluginSessionId: string, credential: PluginCredentialPayload) {
  await storage.setBlob(pluginCredentialStorageKey(pluginSessionId), JSON.stringify(credential))
}

export async function clearPluginCredential(pluginSessionId: string) {
  await storage.delBlob(pluginCredentialStorageKey(pluginSessionId))
}
