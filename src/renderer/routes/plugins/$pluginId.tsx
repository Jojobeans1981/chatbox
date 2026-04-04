import { Button, Center, Stack, Text } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { ChessApp } from '@/plugins/apps/ChessApp'
import { FlashcardsApp } from '@/plugins/apps/FlashcardsApp'
import { QuizApp } from '@/plugins/apps/QuizApp'

export const Route = createFileRoute('/plugins/$pluginId')({
  component: PluginRoute,
})

function PluginRoute() {
  const { pluginId } = Route.useParams()

  if (pluginId === 'flashcards') {
    return <FlashcardsApp />
  }

  if (pluginId === 'chess') {
    return <ChessApp />
  }

  if (pluginId === 'quiz') {
    return <QuizApp />
  }

  return (
    <Center h="100vh">
      <Stack align="center" gap="sm">
        <Text fw={700}>Unknown plugin: {pluginId}</Text>
        <Button component="a" href="#/">
          Back to Chat
        </Button>
      </Stack>
    </Center>
  )
}
