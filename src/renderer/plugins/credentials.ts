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
