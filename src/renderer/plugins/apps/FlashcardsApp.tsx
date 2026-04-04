import { useCallback, useEffect, useMemo, useState } from 'react'
import { isValidPingMessage, isValidToolInvokeMessage } from '../bridge'
import { getPluginBridgeContext } from '../runtime'

type Flashcard = {
  id: string
  front: string
  back: string
}

type FlashcardDeck = {
  title: string
  subject: string
  cards: Flashcard[]
}

const DEFAULT_DECK: FlashcardDeck = {
  title: 'Solar System Flashcards',
  subject: 'Science',
  cards: [
    {
      id: 'mercury',
      front: 'Which planet is closest to the Sun?',
      back: 'Mercury is the closest planet to the Sun.',
    },
    {
      id: 'red-planet',
      front: 'Which planet is known as the Red Planet?',
      back: 'Mars is called the Red Planet because of iron oxide on its surface.',
    },
    {
      id: 'largest-planet',
      front: 'What is the largest planet in our solar system?',
      back: 'Jupiter is the largest planet in the solar system.',
    },
    {
      id: 'rings',
      front: 'Which planet is famous for its rings?',
      back: 'Saturn is famous for its bright ring system.',
    },
  ],
}

export function FlashcardsApp() {
  const bridgeContext = useMemo(() => getPluginBridgeContext(), [])
  const [deck, setDeck] = useState(DEFAULT_DECK)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [status, setStatus] = useState('Review a study deck without leaving the chat.')

  const currentCard = deck.cards[currentIndex] ?? null

  const sendToParent = useCallback(
    (message: Record<string, unknown>) => {
      if (!bridgeContext) {
        return
      }

      window.parent.postMessage({ ...message, ...bridgeContext }, '*')
    },
    [bridgeContext]
  )

  const publishState = useCallback(
    (
      summary: string,
      next?: Partial<{
        deck: FlashcardDeck
        currentIndex: number
        flipped: boolean
      }>
    ) => {
      const effectiveDeck = next?.deck ?? deck
      const effectiveIndex = next?.currentIndex ?? currentIndex
      const effectiveFlipped = next?.flipped ?? flipped

      sendToParent({
        type: 'state_update',
        summary,
        state: {
          deckTitle: effectiveDeck.title,
          subject: effectiveDeck.subject,
          currentIndex: effectiveIndex,
          totalCards: effectiveDeck.cards.length,
          flipped: effectiveFlipped,
          currentCard: effectiveDeck.cards[effectiveIndex] ?? null,
        },
      })
    },
    [currentIndex, deck, flipped, sendToParent]
  )

  const openDeck = useCallback(
    (topic?: string) => {
      const nextDeck =
        topic && topic.trim()
          ? {
              ...DEFAULT_DECK,
              title: `${topic.trim()} Flashcards`,
              subject: topic.trim(),
            }
          : DEFAULT_DECK

      setDeck(nextDeck)
      setCurrentIndex(0)
      setFlipped(false)
      const summary = `Flashcards ready: ${nextDeck.title}. Card 1 of ${nextDeck.cards.length}.`
      setStatus(summary)
      publishState(summary, {
        deck: nextDeck,
        currentIndex: 0,
        flipped: false,
      })

      return {
        deckTitle: nextDeck.title,
        subject: nextDeck.subject,
        totalCards: nextDeck.cards.length,
        currentCard: nextDeck.cards[0],
      }
    },
    [publishState]
  )

  const flipCard = useCallback(() => {
    if (!currentCard) {
      throw new Error('No flashcard is active.')
    }

    const nextFlipped = !flipped
    setFlipped(nextFlipped)
    const summary = nextFlipped ? `Showing answer for card ${currentIndex + 1}.` : `Showing question for card ${currentIndex + 1}.`
    setStatus(summary)
    publishState(summary, { flipped: nextFlipped })

    return {
      card: currentCard,
      flipped: nextFlipped,
      visibleText: nextFlipped ? currentCard.back : currentCard.front,
    }
  }, [currentCard, currentIndex, flipped, publishState])

  const nextCard = useCallback(() => {
    if (!currentCard) {
      throw new Error('No flashcard is active.')
    }

    const nextIndex = (currentIndex + 1) % deck.cards.length
    setCurrentIndex(nextIndex)
    setFlipped(false)
    const summary = `Moved to card ${nextIndex + 1} of ${deck.cards.length}.`
    setStatus(summary)
    publishState(summary, { currentIndex: nextIndex, flipped: false })

    return {
      currentCard: deck.cards[nextIndex],
      currentIndex: nextIndex,
      totalCards: deck.cards.length,
    }
  }, [currentCard, currentIndex, deck, publishState])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!bridgeContext) {
        return
      }

      if (
        isValidToolInvokeMessage(data, {
          ...bridgeContext,
          allowedTools: ['open_deck', 'flip_card', 'next_card'],
        })
      ) {
        try {
          if (data.toolName === 'open_deck') {
            const result = openDeck(typeof data.params?.topic === 'string' ? data.params.topic : undefined)
            sendToParent({
              type: 'tool_result',
              invocationId: data.invocationId,
              result,
              status: 'success',
            })
            return
          }

          if (data.toolName === 'flip_card') {
            const result = flipCard()
            sendToParent({
              type: 'tool_result',
              invocationId: data.invocationId,
              result,
              status: 'success',
            })
            return
          }

          if (data.toolName === 'next_card') {
            const result = nextCard()
            sendToParent({
              type: 'tool_result',
              invocationId: data.invocationId,
              result,
              status: 'success',
            })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Flashcards request failed.'
          setStatus(message)
          sendToParent({
            type: 'tool_result',
            invocationId: data.invocationId,
            result: { error: message },
            status: 'error',
          })
        }
      } else if (isValidPingMessage(data, bridgeContext)) {
        sendToParent({ type: 'pong' })
      }
    }

    window.addEventListener('message', handleMessage)
    if (bridgeContext) {
      sendToParent({ type: 'ready' })
    }
    return () => window.removeEventListener('message', handleMessage)
  }, [bridgeContext, flipCard, nextCard, openDeck, sendToParent])

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px',
        color: '#fff7ed',
        background: 'linear-gradient(160deg, #7c2d12 0%, #431407 40%, #1c1917 100%)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto', display: 'grid', gap: '16px' }}>
        <div
          style={{
            borderRadius: '24px',
            padding: '24px',
            background: 'rgba(41, 17, 7, 0.72)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
            boxShadow: '0 24px 70px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.72 }}>
            Study Deck
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px' }}>{deck.title}</div>
          <div style={{ fontSize: '15px', marginTop: '10px', color: '#fde68a' }}>{status}</div>
        </div>

        <div
          style={{
            borderRadius: '24px',
            padding: '22px',
            minHeight: '260px',
            background: 'rgba(28, 25, 23, 0.82)',
            border: '1px solid rgba(251, 191, 36, 0.18)',
            display: 'grid',
            alignItems: 'center',
            justifyItems: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', opacity: 0.7 }}>
            Card {currentIndex + 1} of {deck.cards.length} | {deck.subject}
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, lineHeight: 1.3, maxWidth: '560px' }}>
            {currentCard ? (flipped ? currentCard.back : currentCard.front) : 'No card selected'}
          </div>
          <div style={{ fontSize: '13px', color: '#fcd34d' }}>
            {flipped ? 'Answer side' : 'Question side'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => openDeck(deck.subject)}
            style={{
              border: 0,
              borderRadius: '12px',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
              color: '#431407',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Restart Deck
          </button>
          <button
            onClick={() => flipCard()}
            style={{
              borderRadius: '12px',
              padding: '12px 16px',
              background: 'transparent',
              color: '#fff7ed',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid rgba(251, 191, 36, 0.2)',
            }}
          >
            Flip Card
          </button>
          <button
            onClick={() => nextCard()}
            style={{
              borderRadius: '12px',
              padding: '12px 16px',
              background: 'transparent',
              color: '#fff7ed',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid rgba(251, 191, 36, 0.2)',
            }}
          >
            Next Card
          </button>
        </div>
      </div>
    </div>
  )
}
