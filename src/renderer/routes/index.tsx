import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Avatar, Badge, Box, Button, Divider, Flex, Paper, ScrollArea, Space, Stack, Text } from '@mantine/core'
import type { CopilotDetail, ImageSource, Session } from '@shared/types'
import {
  IconCards,
  IconChevronLeft,
  IconChevronRight,
  IconDeviceGamepad2,
  IconMessageCircle2Filled,
  IconSchool,
  IconShieldLock,
  IconX,
} from '@tabler/icons-react'
import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { trackJkClickEvent } from '@/analytics/jk'
import { JK_EVENTS, JK_PAGE_NAMES } from '@/analytics/jk-events'
import { MessageLayoutSelector } from '@/components/common/MessageLayoutPreview'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { ImageInStorage } from '@/components/Image'
import InputBox, { type InputBoxPayload } from '@/components/InputBox/InputBox'
import HomepageIcon from '@/components/icons/HomepageIcon'
import Page from '@/components/layout/Page'
import { useMyCopilots, useRemoteCopilotsByCursor } from '@/hooks/useCopilots'
import { useProviders } from '@/hooks/useProviders'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { navigateToSettings } from '@/modals/Settings'
import * as remote from '@/packages/remote'
import platform from '@/platform'
import { router } from '@/router'
import { useAuthInfoStore } from '@/stores/authInfoStore'
import { createSession as createSessionStore } from '@/stores/chatStore'
import { submitNewUserMessage, switchCurrentSession } from '@/stores/sessionActions'
import { initEmptyChatSession } from '@/stores/sessionHelpers'
import { useLanguage, useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { CHATBOX_BUILD_PLATFORM } from '@/variables'
import { getHomeWelcomeCardMode } from '@/utils/homeWelcomeCard'

export const Route = createFileRoute('/')({
  component: Index,
  validateSearch: zodValidator(
    z.object({
      copilotId: z.string().optional(),
      copilot: z.string().optional(),
      settings: z.string().optional(),
    })
  ),
})

function Index() {
  const { t } = useTranslation()
  const isSmallScreen = useIsSmallScreen()
  const messageLayout = useSettingsStore((s) => s.messageLayout)
  const [tempMessageLayout, setTempMessageLayout] = useState<'left' | 'bubble' | undefined>(undefined)

  const setSettings = useSettingsStore((s) => s.setSettings)
  const newSessionState = useUIStore((s) => s.newSessionState)
  const setNewSessionState = useUIStore((s) => s.setNewSessionState)
  const addSessionKnowledgeBase = useUIStore((s) => s.addSessionKnowledgeBase)
  const showCopilotsInNewSession = useUIStore((s) => s.showCopilotsInNewSession)
  const widthFull = useUIStore((s) => s.widthFull)
  const sessionWebBrowsingMap = useUIStore((s) => s.sessionWebBrowsingMap)
  const setSessionWebBrowsing = useUIStore((s) => s.setSessionWebBrowsing)
  const clearSessionWebBrowsing = useUIStore((s) => s.clearSessionWebBrowsing)
  const [session, setSession] = useState<Session>({
    id: 'new',
    ...initEmptyChatSession(),
  })

  const { providers } = useProviders()
  const language = useLanguage()
  const hasLicense = useSettingsStore((s) => Boolean(s.licenseKey))
  const isLoggedIn = useAuthInfoStore((s) => Boolean(s.accessToken && s.refreshToken))
  const welcomeCardMode = useMemo(
    () => getHomeWelcomeCardMode({ providerCount: providers.length, isLoggedIn, hasLicense }),
    [providers.length, isLoggedIn, hasLicense]
  )
  const showDemoLanding = CHATBOX_BUILD_PLATFORM === 'web' && providers.length === 0 && !isLoggedIn && !hasLicense

  const selectedModel = useMemo(() => {
    if (session.settings?.provider && session.settings?.modelId) {
      return {
        provider: session.settings.provider,
        modelId: session.settings.modelId,
      }
    }
  }, [session.settings?.provider, session.settings?.modelId])

  const { copilots: myCopilots } = useMyCopilots()
  const { copilots: remoteCopilots } = useRemoteCopilotsByCursor({ limit: 10 })
  const selectedCopilotId = useMemo(() => session?.copilotId, [session?.copilotId])
  const selectedCopilot = useMemo(
    () => myCopilots.find((c) => c.id === selectedCopilotId) || remoteCopilots.find((c) => c.id === selectedCopilotId),
    [myCopilots, remoteCopilots, selectedCopilotId]
  )
  useEffect(() => {
    setSession((old) => ({
      ...old,
      assistantAvatarKey:
        selectedCopilot?.avatar?.type === 'storage-key' ? selectedCopilot.avatar.storageKey : undefined,
      picUrl: selectedCopilot?.avatar?.type === 'url' ? selectedCopilot.avatar.url : selectedCopilot?.picUrl,
      backgroundImage: selectedCopilot?.backgroundImage,
      name: selectedCopilot?.name || 'Untitled',
      messages: selectedCopilot
        ? [
            {
              id: uuidv4(),
              role: 'system',
              contentParts: [
                {
                  type: 'text',
                  text: selectedCopilot.prompt,
                },
              ],
            },
          ]
        : initEmptyChatSession().messages,
    }))
  }, [selectedCopilot])

  const routerState = useRouterState()
  useEffect(() => {
    const { copilotId, copilot } = routerState.location.search
    if (copilot) {
      let c: CopilotDetail | null = null
      try {
        c = JSON.parse(copilot) as CopilotDetail
      } catch (e) {
        return
      }

      setSession((old) => ({
        ...old,
        copilotId: c.id,
        assistantAvatarKey: c.avatar?.type === 'storage-key' ? c.avatar.storageKey : undefined,
        picUrl: c.avatar?.type === 'url' ? c.avatar.url : c.picUrl,
        backgroundImage: c.backgroundImage,
        name: c.name || 'Untitled',
        messages: [
          {
            id: uuidv4(),
            role: 'system',
            contentParts: [
              {
                type: 'text',
                text: c.prompt,
              },
            ],
          },
        ],
      }))
    } else if (copilotId) {
      setSession((old) => ({ ...old, copilotId }))
    }
  }, [routerState.location.search])

  const handleSubmit = useCallback(
    async ({ constructedMessage, needGenerating = true, onUserMessageReady }: InputBoxPayload) => {
      const newSession = await createSessionStore({
        name: session.name,
        type: 'chat',
        assistantAvatarKey: session.assistantAvatarKey,
        picUrl: session.picUrl,
        backgroundImage: session.backgroundImage,
        messages: session.messages,
        copilotId: session.copilotId,
        settings: session.settings,
      })

      if (session.copilotId) {
        void remote
          .recordCopilotUsage({ id: session.copilotId, action: 'create_session' })
          .catch((error) => console.warn('[recordCopilotUsage] failed', error))
      }

      // Transfer knowledge base from newSessionState to the actual session
      if (newSessionState.knowledgeBase) {
        addSessionKnowledgeBase(newSession.id, newSessionState.knowledgeBase)
        // Clear newSessionState after transfer
        setNewSessionState({})
      }

      // Transfer web browsing setting from "new" session to the actual session
      const newSessionWebBrowsing = sessionWebBrowsingMap['new']
      if (newSessionWebBrowsing !== undefined) {
        setSessionWebBrowsing(newSession.id, newSessionWebBrowsing)
        clearSessionWebBrowsing('new')
      }

      switchCurrentSession(newSession.id)

      void submitNewUserMessage(newSession.id, {
        newUserMsg: constructedMessage,
        needGenerating,
        onUserMessageReady,
      })
    },
    [
      session,
      addSessionKnowledgeBase,
      newSessionState.knowledgeBase,
      setNewSessionState,
      sessionWebBrowsingMap,
      setSessionWebBrowsing,
      clearSessionWebBrowsing,
    ]
  )

  const onSelectModel = useCallback((p: string, m: string) => {
    setSession((old) => ({
      ...old,
      settings: {
        ...(old.settings || {}),
        provider: p,
        modelId: m,
      },
    }))
  }, [])

  const onClickSessionSettings = useCallback(async () => {
    const res: Session = await NiceModal.show('session-settings', {
      session,
      disableAutoSave: true,
    })
    if (res) {
      setSession((old) => ({
        ...old,
        ...res,
      }))
    }
    return true
  }, [session])

  const demoApps = useMemo(
    () => [
      {
        id: 'chess',
        name: 'Chess',
        description: 'Play a full game in-chat, ask for a hint mid-match, and keep the board state in context.',
        badge: 'Required app',
        icon: IconDeviceGamepad2,
      },
      {
        id: 'quiz',
        name: 'Quiz Studio',
        description: 'Students answer questions in chat while teachers can unlock editing with a protected passcode.',
        badge: 'Authenticated',
        icon: IconShieldLock,
      },
      {
        id: 'flashcards',
        name: 'Flashcards',
        description: 'Review cards, flip for answers, and move through a study deck without leaving the conversation.',
        badge: 'Study tool',
        icon: IconCards,
      },
    ],
    []
  )

  return (
    <Page title="">
      <div className="p-0 flex flex-col h-full">
        {showDemoLanding ? (
          <Stack align="center" justify="center" gap="lg" flex={1} p="md">
            <Stack gap="xs" align="center" maw={720}>
              <Badge variant="light" radius="xl" size="lg">
                TutorMeAI Demo
              </Badge>
              <Text fw={700} size={isSmallScreen ? 'xl' : '32px'} ta="center">
                Launch the embedded learning apps directly
              </Text>
              <Text c="chatbox-secondary" ta="center" maw={620}>
                This public build opens in demo mode so reviewers can try the K-12 app experiences without configuring
                an AI provider first.
              </Text>
            </Stack>

            <Flex
              gap="md"
              wrap="wrap"
              justify="center"
              className={widthFull ? 'w-full' : 'w-full max-w-5xl mx-auto'}
            >
              {demoApps.map((app) => {
                const Icon = app.icon
                return (
                  <Paper
                    key={app.id}
                    radius="xl"
                    withBorder
                    p="lg"
                    shadow="none"
                    style={{ width: isSmallScreen ? '100%' : 320 }}
                  >
                    <Stack gap="md" h="100%" justify="space-between">
                      <Stack gap="sm">
                        <Flex justify="space-between" align="center" gap="sm">
                          <Flex align="center" gap="sm">
                            <Box
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 14,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background:
                                  'linear-gradient(135deg, var(--chatbox-background-brand-secondary), rgba(99, 102, 241, 0.14))',
                              }}
                            >
                              <Icon size={22} color="var(--chatbox-tint-brand)" />
                            </Box>
                            <Stack gap={2}>
                              <Text fw={700}>{app.name}</Text>
                              <Badge variant="dot" color="chatbox-brand" w="fit-content">
                                {app.badge}
                              </Badge>
                            </Stack>
                          </Flex>
                        </Flex>
                        <Text c="chatbox-secondary">{app.description}</Text>
                      </Stack>

                      <Button
                        fullWidth
                        onClick={() =>
                          router.navigate({
                            to: '/plugins/$pluginId',
                            params: { pluginId: app.id },
                          })
                        }
                      >
                        Open {app.name}
                      </Button>
                    </Stack>
                  </Paper>
                )
              })}
            </Flex>

            <Paper radius="lg" withBorder p="md" className={widthFull ? 'w-full' : 'w-full max-w-3xl mx-auto'}>
              <Flex align="flex-start" gap="sm">
                <Box
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--chatbox-background-brand-secondary)',
                  }}
                >
                  <IconSchool size={18} color="var(--chatbox-tint-brand)" />
                </Box>
                <Stack gap={4}>
                  <Text fw={600}>Reviewer notes</Text>
                  <Text c="chatbox-secondary">
                    Chess shows complex ongoing state, Quiz Studio demonstrates authenticated teacher controls, and
                    Flashcards covers a lightweight study workflow inside the same host shell.
                  </Text>
                </Stack>
              </Flex>
            </Paper>
          </Stack>
        ) : messageLayout || welcomeCardMode !== 'none' ? (
          <Stack align="center" justify="center" gap="sm" flex={1}>
            <HomepageIcon className="h-8" />
            <Text fw="600" size={isSmallScreen ? 'sm' : 'md'}>
              {t('What can I help you with today?')}
            </Text>
          </Stack>
        ) : (
          <Stack align="center" justify="center" gap="sm" flex={1} p="sm">
            <Stack
              align="center"
              justify="center"
              gap="lg"
              w={isSmallScreen ? '100%' : '80%'}
              maw={386}
              p="xl"
              className="border border-solid border-chatbox-border-primary rounded-lg relative"
            >
              <div className="absolute top-0 right-0">
                <ActionIcon
                  variant="transparent"
                  color="chatbox-tertiary"
                  m={10}
                  onClick={() => setSettings({ messageLayout: 'left' })}
                >
                  <ScalableIcon icon={IconX} size={20} className="text-chatbox-tint-tertiary" />
                </ActionIcon>
              </div>
              <Text size="md" fw="600">
                {t('Message Layout')}
              </Text>
              <Stack gap="sm">
                <MessageLayoutSelector
                  w="100%"
                  size="sm"
                  value={tempMessageLayout || 'left'}
                  onValueChange={(val) => setTempMessageLayout(val)}
                />

                <Text size="xs" c="chatbox-secondary">
                  {t('You can change this setting later in Settings → ')}
                  <a className="cursor-pointer !text-chatbox-tint-brand" onClick={() => navigateToSettings('chat')}>
                    {t('Conversation Settings')}
                  </a>
                </Text>
              </Stack>

              <Button
                variant="filled"
                size="md"
                className="w-full"
                onClick={() => setSettings({ messageLayout: tempMessageLayout || 'left' })}
              >
                {t('Save')}
              </Button>
            </Stack>
          </Stack>
        )}

        {!showDemoLanding && welcomeCardMode !== 'none' && (
          <Box px="sm">
            <Paper
              radius="md"
              shadow="none"
              withBorder
              py="md"
              px="sm"
              mb="md"
              className={widthFull ? 'w-full' : 'w-full max-w-4xl mx-auto'}
            >
              <Stack gap="sm">
                <Stack gap="xxs" align="center">
                  <Text fw={600} className="text-center">
                    {t('Welcome to Chatbox!')}
                  </Text>

                  <Text size="xs" c="chatbox-tertiary" className="text-center">
                    {welcomeCardMode === 'no-license' ? t('No licenses found') : t('Login to start chatting with AI')}
                  </Text>
                </Stack>

                <Flex gap="xs" justify="center" align="center" wrap="wrap">
                  {welcomeCardMode === 'no-license' ? (
                    <>
                      <Button
                        size="xs"
                        variant="filled"
                        h={32}
                        miw={160}
                        fw={600}
                        flex="0 1 auto"
                        onClick={() => {
                          trackJkClickEvent(JK_EVENTS.FREE_LICENSE_CLAIM_CLICK, {
                            pageName: JK_PAGE_NAMES.CHAT_PAGE,
                          })
                          platform.openLink(
                            `https://chatboxai.app/redirect_app/claim_free_plan/${language}/?utm_source=app&utm_content=provider_cb_login_claim_free`
                          )
                        }}
                      >
                        {t('Claim Free Plan')}
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        c="chatbox-tertiary"
                        h={32}
                        fw={400}
                        flex="0 1 auto"
                        onClick={() => {
                          platform.openLink(
                            `https://chatboxai.app/redirect_app/view_more_plans/${language}/?utm_source=app&utm_content=provider_cb_login_more_plans`
                          )
                        }}
                      >
                        {t('View More Plans')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="xs"
                        variant="filled"
                        h={32}
                        miw={160}
                        fw={600}
                        flex="0 1 auto"
                        onClick={() => {
                          trackJkClickEvent(JK_EVENTS.LOGIN_BUTTON_CLICK, {
                            pageName: JK_PAGE_NAMES.CHAT_PAGE,
                          })
                          navigateToSettings('chatbox-ai')
                        }}
                      >
                        {t('Login Chatbox AI')}
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        c="chatbox-tertiary"
                        h={32}
                        fw={400}
                        flex="0 1 auto"
                        onClick={() => navigateToSettings('provider')}
                      >
                        {t('Other options')}
                      </Button>
                    </>
                  )}
                </Flex>
              </Stack>
            </Paper>
          </Box>
        )}

        {!showDemoLanding && (
          <Stack gap="sm">
          {session.copilotId ? (
            <Box px="md">
              <Stack gap="sm" className={widthFull ? 'w-full' : 'w-full max-w-4xl mx-auto'}>
                <Flex align="center" gap="sm">
                  <CopilotItem
                    name={session.name}
                    avatar={
                      session.assistantAvatarKey
                        ? { type: 'storage-key', storageKey: session.assistantAvatarKey }
                        : undefined
                    }
                    picUrl={session.picUrl}
                    selected
                    onClick={() => onClickSessionSettings?.()}
                  />
                  <ActionIcon
                    size={32}
                    radius={16}
                    c="chatbox-tertiary"
                    bg="#F1F3F5"
                    onClick={() => setSession((old) => ({ ...old, copilotId: undefined }))}
                  >
                    <ScalableIcon icon={IconX} size={24} />
                  </ActionIcon>
                </Flex>

                <Text c="chatbox-secondary" className="line-clamp-5">
                  {session.messages[0]?.contentParts?.map((part) => (part.type === 'text' ? part.text : '')).join('') ||
                    ''}
                </Text>
              </Stack>
            </Box>
          ) : (
            showCopilotsInNewSession && (
              <CopilotPicker onSelect={(copilot) => setSession((old) => ({ ...old, copilotId: copilot?.id }))} />
            )
          )}

          <InputBox
            sessionType="chat"
            sessionId="new"
            model={selectedModel}
            // fullWidth
            onSelectModel={onSelectModel}
            onClickSessionSettings={onClickSessionSettings}
            onSubmit={handleSubmit}
          />
          </Stack>
        )}
      </div>
    </Page>
  )
}

const MAX_COPILOTS_TO_SHOW = 10

const CopilotPicker = ({ selectedId, onSelect }: { selectedId?: string; onSelect?(copilot?: CopilotDetail): void }) => {
  const { t } = useTranslation()
  const isSmallScreen = useIsSmallScreen()
  const widthFull = useUIStore((s) => s.widthFull)
  const { copilots: myCopilots } = useMyCopilots()
  const { copilots: remoteCopilots } = useRemoteCopilotsByCursor()

  const copilots = useMemo(
    () =>
      myCopilots.length >= MAX_COPILOTS_TO_SHOW
        ? myCopilots
        : [
            ...myCopilots,
            ...(myCopilots.length && remoteCopilots.length ? [undefined] : []),
            ...remoteCopilots
              .filter((c) => !myCopilots.map((mc) => mc.id).includes(c.id))
              .slice(0, MAX_COPILOTS_TO_SHOW - myCopilots.length - 1),
          ],
    [myCopilots, remoteCopilots]
  )

  const showMoreButton = useMemo(
    () => copilots.length < myCopilots.length + remoteCopilots.length,
    [copilots.length, myCopilots.length, remoteCopilots.length]
  )

  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrollPosition, onScrollPositionChange] = useState({ x: 0, y: 0 })

  if (!copilots.length) {
    return null
  }

  return (
    <Box px="md">
      <Stack gap="xs" className={widthFull ? 'w-full' : 'w-full max-w-4xl mx-auto'}>
        <Flex align="center" justify="space-between">
          <Text size="xxs" c="chatbox-tertiary">
            {t('My Copilots').toUpperCase()}
          </Text>

          {!isSmallScreen && (
            <Flex align="center" gap="sm">
              <ActionIcon
                variant="transparent"
                color="chatbox-tertiary"
                // onClick={() => setPage((p) => Math.max(p - 1, 0))}
                onClick={() => {
                  if (viewportRef.current) {
                    // const scrollWidth = viewportRef.current.scrollWidth
                    const clientWidth = viewportRef.current.clientWidth
                    const newScrollPosition = Math.max(scrollPosition.x - clientWidth, 0)
                    viewportRef.current.scrollTo({ left: newScrollPosition, behavior: 'smooth' })
                    onScrollPositionChange({ x: newScrollPosition, y: 0 })
                  }
                }}
              >
                <ScalableIcon icon={IconChevronLeft} />
              </ActionIcon>
              <ActionIcon
                variant="transparent"
                color="chatbox-tertiary"
                // onClick={() => setPage((p) => p + 1)}
                onClick={() => {
                  if (viewportRef.current) {
                    const scrollWidth = viewportRef.current.scrollWidth
                    const clientWidth = viewportRef.current.clientWidth
                    const newScrollPosition = Math.min(scrollPosition.x + clientWidth, scrollWidth - clientWidth)
                    viewportRef.current.scrollTo({ left: newScrollPosition, behavior: 'smooth' })
                    onScrollPositionChange({ x: newScrollPosition, y: 0 })
                  }
                }}
              >
                <ScalableIcon icon={IconChevronRight} />
              </ActionIcon>
            </Flex>
          )}
        </Flex>

        <ScrollArea
          type={isSmallScreen ? 'never' : 'scroll'}
          mx="-md"
          scrollbars="x"
          offsetScrollbars="x"
          viewportRef={viewportRef}
          onScrollPositionChange={onScrollPositionChange}
          className="copilot-picker-scroll-area"
        >
          {scrollPosition.x > 8 && !isSmallScreen && (
            <div className="absolute top-0 left-0 w-8 h-full bg-gradient-to-r from-chatbox-background-primary to-transparent"></div>
          )}
          {!isSmallScreen && (
            <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-chatbox-background-primary to-transparent"></div>
          )}
          <Flex wrap="nowrap" gap="xs">
            <Space w="xs" />
            {copilots.map((copilot) =>
              copilot ? (
                <CopilotItem
                  key={copilot.id}
                  name={copilot.name}
                  avatar={copilot.avatar}
                  picUrl={copilot.picUrl}
                  selected={selectedId === copilot.id}
                  onClick={() => {
                    onSelect?.(copilot)
                  }}
                />
              ) : (
                <Divider key="divider" orientation="vertical" my="xs" mx="xxs" />
              )
            )}
            {showMoreButton && (
              <CopilotItem
                name={t('View All Copilots')}
                noAvatar={true}
                selected={false}
                onClick={() =>
                  router.navigate({
                    to: '/copilots',
                  })
                }
              />
            )}
            <Space w="xs" />
          </Flex>
        </ScrollArea>
      </Stack>
    </Box>
  )
}

const CopilotItem = ({
  name,
  avatar,
  picUrl,
  selected,
  onClick,
  noAvatar = false,
}: {
  name: string
  avatar?: ImageSource
  picUrl?: string
  selected?: boolean
  onClick?(): void
  noAvatar?: boolean
}) => {
  const isSmallScreen = useIsSmallScreen()
  return (
    <Flex
      align="center"
      gap={isSmallScreen ? 'xxs' : 'xs'}
      py="xs"
      px={isSmallScreen ? 'xs' : 'md'}
      bd={selected ? 'none' : '1px solid var(--chatbox-border-primary)'}
      bg={selected ? 'var(--chatbox-background-brand-secondary)' : 'transparent'}
      className={clsx(
        'max-w-[75vw] sm:max-w-[50vw] cursor-pointer shrink-0 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.04)]',
        isSmallScreen ? 'rounded-full' : 'rounded-md'
      )}
      onClick={onClick}
    >
      {!noAvatar &&
        (avatar?.type === 'storage-key' || avatar?.type === 'url' || picUrl ? (
          <Avatar
            src={avatar?.type === 'storage-key' ? '' : avatar?.url || picUrl}
            alt={name}
            size={isSmallScreen ? 20 : 24}
            radius="xl"
            className="flex-shrink-0 border border-solid border-chatbox-border-primary"
          >
            {avatar?.type === 'storage-key' ? (
              <ImageInStorage storageKey={avatar.storageKey} className="object-cover object-center w-full h-full" />
            ) : (
              name?.charAt(0)?.toUpperCase()
            )}
          </Avatar>
        ) : (
          <Stack
            w={isSmallScreen ? 20 : 24}
            h={isSmallScreen ? 20 : 24}
            align="center"
            justify="center"
            className="flex-shrink-0 rounded-full bg-chatbox-background-brand-secondary"
          >
            <ScalableIcon icon={IconMessageCircle2Filled} size={24} className="text-chatbox-tint-brand" />
          </Stack>
        ))}
      <Text fw="600" c={selected ? 'chatbox-brand' : 'chatbox-primary'} lineClamp={1}>
        {name}
      </Text>
    </Flex>
  )
}
