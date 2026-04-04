import type { PlatformToPluginMessage } from './types'

type PluginFrameHost = {
  isReady: () => boolean
  postMessage: (message: PlatformToPluginMessage) => void
}

type PendingInvocation = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timeoutId: ReturnType<typeof setTimeout>
}

class PluginBridgeController {
  private hosts = new Map<string, PluginFrameHost>()
  private pendingInvocations = new Map<string, PendingInvocation>()

  registerHost(pluginSessionId: string, host: PluginFrameHost) {
    this.hosts.set(pluginSessionId, host)
  }

  unregisterHost(pluginSessionId: string) {
    this.hosts.delete(pluginSessionId)
  }

  async invoke(
    pluginSessionId: string,
    message: Extract<PlatformToPluginMessage, { type: 'tool_invoke' }>,
    timeoutMs = 15000
  ) {
    const host = this.hosts.get(pluginSessionId)
    if (!host || !host.isReady()) {
      throw new Error('The app is not ready yet. Ask the user to open the app first.')
    }

    return await new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingInvocations.delete(message.invocationId)
        reject(new Error('The embedded app did not respond in time.'))
      }, timeoutMs)

      this.pendingInvocations.set(message.invocationId, {
        resolve,
        reject,
        timeoutId,
      })

      host.postMessage(message)
    })
  }

  resolveInvocation(invocationId: string, result: unknown, status: 'success' | 'error') {
    const pending = this.pendingInvocations.get(invocationId)
    if (!pending) {
      return
    }

    clearTimeout(pending.timeoutId)
    this.pendingInvocations.delete(invocationId)

    if (status === 'error') {
      pending.reject(result instanceof Error ? result : new Error(String((result as { error?: string })?.error ?? 'App error')))
      return
    }

    pending.resolve(result)
  }
}

export const pluginBridgeController = new PluginBridgeController()
