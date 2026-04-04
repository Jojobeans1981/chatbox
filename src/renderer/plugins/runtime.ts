export type PluginBridgeContext = {
  pluginId: string
  sessionId: string
  capabilityToken: string
}

function getHashSearchParams() {
  if (typeof window === 'undefined') {
    return new URLSearchParams()
  }

  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  if (queryIndex === -1) {
    return new URLSearchParams(window.location.search)
  }

  return new URLSearchParams(hash.slice(queryIndex + 1))
}

export function getPluginBridgeContext(): PluginBridgeContext | null {
  if (typeof window === 'undefined') {
    return null
  }

  const params = getHashSearchParams()
  const pluginId = params.get('pluginId')
  const sessionId = params.get('sessionId')
  const capabilityToken = params.get('capabilityToken')

  if (!pluginId || !sessionId || !capabilityToken) {
    return null
  }

  return { pluginId, sessionId, capabilityToken }
}
