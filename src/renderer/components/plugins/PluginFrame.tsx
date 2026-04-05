import { Alert, Box, Group, Loader, Text, UnstyledButton } from '@mantine/core'
import { IconAlertCircle, IconChevronDown, IconChevronUp, IconPlugConnected } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parsePluginToPlatformMessage } from '@/plugins/bridge'
import { pluginBridgeController } from '@/plugins/bridge-controller'
import { clearPluginCredential, loadPluginCredential, savePluginCredential } from '@/plugins/credentials'
import { getPluginById } from '@/plugins/manifests'
import { persistPluginCompletion, persistPluginStateUpdate } from '@/plugins/toolset'
import type { PlatformToPluginMessage } from '@/plugins/types'
import { useSession } from '@/stores/chatStore'

type PluginFrameProps = {
  chatSessionId: string
  pluginId: string
  pluginSessionId: string
  capabilityToken: string
  allowedTools: string[]
  pendingInvocationId?: string
  pendingToolName?: string
  pendingToolParams?: Record<string, unknown>
}

function buildPluginIframeUrl(pluginId: string, pluginSessionId: string, capabilityToken: string) {
  if (typeof window === 'undefined') {
    return ''
  }

  const plugin = getPluginById(pluginId)
  const iframePath = plugin?.iframeUrl ?? `/plugins/${pluginId}`

  const query = `pluginId=${encodeURIComponent(pluginId)}&sessionId=${encodeURIComponent(pluginSessionId)}&capabilityToken=${encodeURIComponent(capabilityToken)}`
  if (window.location.hash.startsWith('#/')) {
    if (iframePath.startsWith('http://') || iframePath.startsWith('https://')) {
      return `${iframePath}${iframePath.includes('?') ? '&' : '?'}${query}`
    }
    return `${window.location.origin}${window.location.pathname}${window.location.search}#${iframePath}?${query}`
  }

  if (iframePath.startsWith('http://') || iframePath.startsWith('https://')) {
    return `${iframePath}${iframePath.includes('?') ? '&' : '?'}${query}`
  }

  return `${window.location.origin}${iframePath}?${query}`
}

export default function PluginFrame({
  chatSessionId,
  pluginId,
  pluginSessionId,
  capabilityToken,
  pendingInvocationId,
  pendingToolName,
  pendingToolParams,
}: PluginFrameProps) {
  const { t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const plugin = getPluginById(pluginId)
  const { session } = useSession(chatSessionId)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const sentInitialInvocation = useRef<string | null>(null)

  const iframeUrl = useMemo(
    () => buildPluginIframeUrl(pluginId, pluginSessionId, capabilityToken),
    [pluginId, pluginSessionId, capabilityToken]
  )
  const pluginOrigin = useMemo(() => {
    try {
      const origin = new URL(iframeUrl).origin
      const trustedHosts = plugin?.originPolicy?.trustedHosts ?? ['self']
      const expectedHost = new URL(iframeUrl).host
      if (trustedHosts.includes('self') && origin === window.location.origin) {
        return origin
      }
      if (trustedHosts.includes(expectedHost)) {
        return origin
      }
      return null
    } catch {
      return null
    }
  }, [iframeUrl, plugin?.originPolicy?.trustedHosts])
  const sandboxPolicy = useMemo(
    () => (plugin?.originPolicy?.sandboxPermissions ?? ['allow-scripts', 'allow-forms']).join(' '),
    [plugin?.originPolicy?.sandboxPermissions]
  )
  const pluginSession = useMemo(
    () => session?.activePlugins?.find((entry) => entry.id === pluginSessionId),
    [session?.activePlugins, pluginSessionId]
  )
  const shouldSendInitialInvocation =
    !pluginSession?.stateSnapshot || Object.keys(pluginSession.stateSnapshot).length === 0

  const postMessage = useCallback(
    (message: PlatformToPluginMessage) => {
      if (!iframeRef.current?.contentWindow || !pluginOrigin) {
        return
      }
      iframeRef.current.contentWindow.postMessage(message, pluginOrigin)
    },
    [pluginOrigin]
  )

  useEffect(() => {
    pluginBridgeController.registerHost(pluginSessionId, {
      isReady: () => isReady,
      postMessage,
    })

    return () => {
      pluginBridgeController.unregisterHost(pluginSessionId)
    }
  }, [pluginSessionId, isReady, postMessage])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!pluginOrigin || event.origin !== pluginOrigin || event.source !== iframeRef.current?.contentWindow) {
        return
      }

      const data = parsePluginToPlatformMessage(event.data, {
        pluginId,
        sessionId: pluginSessionId,
        capabilityToken,
      })
      if (!data) {
        return
      }

      switch (data.type) {
        case 'ready':
          setIsReady(true)
          break
        case 'pong':
          break
        case 'tool_result':
          pluginBridgeController.resolveInvocation(data.invocationId, data.result, data.status)
          break
        case 'state_update':
          void persistPluginStateUpdate(chatSessionId, pluginSessionId, data.summary, data.state)
          break
        case 'completion':
          void persistPluginCompletion(chatSessionId, pluginSessionId, data.summary)
          break
        case 'credential_update':
          if (data.credential) {
            void savePluginCredential(pluginSessionId, data.credential)
          } else {
            void clearPluginCredential(pluginSessionId)
          }
          postMessage({
            type: 'credential_state',
            pluginId,
            sessionId: pluginSessionId,
            capabilityToken,
            credential: data.credential,
          })
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [chatSessionId, pluginId, pluginOrigin, pluginSessionId, capabilityToken, postMessage])

  useEffect(() => {
    if (!isReady) {
      return
    }

    void (async () => {
      const credential = await loadPluginCredential(pluginSessionId)
      postMessage({
        type: 'credential_state',
        pluginId,
        sessionId: pluginSessionId,
        capabilityToken,
        credential,
      })
    })()
  }, [isReady, pluginId, pluginSessionId, capabilityToken, postMessage])

  useEffect(() => {
    if (
      !isReady ||
      !pendingInvocationId ||
      !pendingToolName ||
      sentInitialInvocation.current === pendingInvocationId ||
      !shouldSendInitialInvocation
    ) {
      return
    }

    sentInitialInvocation.current = pendingInvocationId
    postMessage({
      type: 'tool_invoke',
      pluginId,
      sessionId: pluginSessionId,
      capabilityToken,
      invocationId: pendingInvocationId,
      toolName: pendingToolName,
      params: pendingToolParams ?? {},
    })
  }, [
    isReady,
    pendingInvocationId,
    pendingToolName,
    pendingToolParams,
    postMessage,
    pluginId,
    pluginSessionId,
    capabilityToken,
    shouldSendInitialInvocation,
  ])

  useEffect(() => {
    if (!isReady) {
      return
    }

    const intervalId = setInterval(() => {
      postMessage({
        type: 'ping',
        pluginId,
        sessionId: pluginSessionId,
        capabilityToken,
      })
    }, 10000)

    return () => clearInterval(intervalId)
  }, [isReady, postMessage, pluginId, pluginSessionId, capabilityToken])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!isReady) {
        setError('The embedded app took too long to load.')
      }
    }, 15000)

    return () => clearTimeout(timeoutId)
  }, [isReady])

  if (!plugin) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} radius="md" mt="xs">
        {t('Plugin not found')}
      </Alert>
    )
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} radius="md" mt="xs">
        {error}
      </Alert>
    )
  }

  return (
    <Box
      mt="xs"
      style={{
        border: '1px solid var(--chatbox-border-primary)',
        borderRadius: '16px',
        overflow: 'hidden',
        backgroundColor: 'var(--chatbox-background-secondary)',
      }}
    >
      <Group justify="space-between" px="sm" py="xs" style={{ borderBottom: '1px solid var(--chatbox-border-primary)' }}>
        <Group gap={6}>
          {!isReady ? <Loader size={14} /> : <IconPlugConnected size={14} color="var(--chatbox-tint-success)" />}
          <Text size="xs" c="chatbox-secondary" fw={600}>
            {plugin.name}
          </Text>
        </Group>
        <UnstyledButton onClick={() => setExpanded((current) => !current)}>
          {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </UnstyledButton>
      </Group>
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        sandbox={sandboxPolicy}
        referrerPolicy="same-origin"
        title={plugin.name}
        onError={() => setError('Failed to load the embedded app.')}
        style={{
          width: '100%',
          border: 0,
          display: 'block',
          background: 'white',
          height: expanded ? 560 : 420,
        }}
      />
    </Box>
  )
}
