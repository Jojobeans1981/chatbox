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
        color: '#0f172a',
        background:
          'radial-gradient(circle at top left, rgba(168, 85, 247, 0.16), transparent 24%), radial-gradient(circle at top right, rgba(244, 114, 182, 0.14), transparent 26%), linear-gradient(180deg, #fdf4ff 0%, #ffffff 42%, #fdf2f8 100%)',
        fontFamily: '"Trebuchet MS", "Avenir Next", sans-serif',
      }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto', display: 'grid', gap: '16px' }}>
        <div
          style={{
            borderRadius: '30px',
            padding: '24px',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 24px 70px rgba(236, 72, 153, 0.16)',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.72 }}>
            Memory Boost
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px' }}>{deck.title}</div>
          <div style={{ fontSize: '15px', marginTop: '10px', color: 'rgba(255,255,255,0.9)' }}>{status}</div>
        </div>

        <div
          style={{
            borderRadius: '30px',
            padding: '22px',
            minHeight: '260px',
            background: '#ffffff',
            border: '1px solid rgba(236, 72, 153, 0.12)',
            display: 'grid',
            alignItems: 'center',
            justifyItems: 'center',
            textAlign: 'center',
            boxShadow: '0 24px 50px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ fontSize: '12px', opacity: 0.7, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Card {currentIndex + 1} of {deck.cards.length} | {deck.subject}
          </div>
          <div style={{ fontSize: '29px', fontWeight: 900, lineHeight: 1.28, maxWidth: '560px', color: '#0f172a' }}>
            {currentCard ? (flipped ? currentCard.back : currentCard.front) : 'No card selected'}
          </div>
          <div
            style={{
              fontSize: '13px',
              color: flipped ? '#be185d' : '#7c3aed',
              fontWeight: 800,
              padding: '6px 12px',
              borderRadius: '999px',
              background: flipped ? 'rgba(244, 114, 182, 0.12)' : 'rgba(168, 85, 247, 0.12)',
            }}
          >
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
              borderRadius: '14px',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 12px 24px rgba(236, 72, 153, 0.18)',
            }}
          >
            Restart Deck
          </button>
          <button
            onClick={() => flipCard()}
            style={{
              borderRadius: '14px',
              padding: '12px 16px',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid rgba(148, 163, 184, 0.18)',
            }}
          >
            Flip Card
          </button>
          <button
            onClick={() => nextCard()}
            style={{
              borderRadius: '14px',
              padding: '12px 16px',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid rgba(148, 163, 184, 0.18)',
            }}
          >
            Next Card
          </button>
        </div>
      </div>
    </div>
  )
}
