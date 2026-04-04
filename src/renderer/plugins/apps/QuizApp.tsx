import { useCallback, useEffect, useMemo, useState } from 'react'
import { isValidCredentialStateMessage, isValidPingMessage, isValidToolInvokeMessage } from '../bridge'
import { getPluginBridgeContext } from '../runtime'

type QuizQuestion = {
  id: string
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
}

type QuizDeck = {
  title: string
  teacher: string
  questions: QuizQuestion[]
}

type QuizProgress = {
  currentIndex: number
  score: number
  completed: boolean
  answers: Array<{
    questionId: string
    selectedIndex: number
    correct: boolean
  }>
}

const DEFAULT_TEACHER_PASSCODE = 'TUTOR-CLASSROOM'

const DEFAULT_DECK: QuizDeck = {
  title: 'Fractions Review',
  teacher: 'Ms. Rivera',
  questions: [
    {
      id: 'q1',
      prompt: 'Which fraction is equivalent to 1/2?',
      choices: ['2/6', '3/6', '4/10', '5/12'],
      correctIndex: 1,
      explanation: '3/6 simplifies to 1/2 because both numbers divide by 3.',
    },
    {
      id: 'q2',
      prompt: 'What is 3/4 + 1/4?',
      choices: ['1', '7/8', '4/8', '3/8'],
      correctIndex: 0,
      explanation: 'When the denominators match, add the numerators: 3 + 1 = 4, so 4/4 = 1.',
    },
    {
      id: 'q3',
      prompt: 'Which comparison is true?',
      choices: ['2/3 < 3/4', '5/8 > 4/5', '1/6 > 1/3', '7/10 = 3/5'],
      correctIndex: 0,
      explanation: '2/3 is about 0.67 and 3/4 is 0.75, so 2/3 is smaller.',
    },
  ],
}

function buildInitialProgress(deck: QuizDeck): QuizProgress {
  return {
    currentIndex: 0,
    score: 0,
    completed: false,
    answers: [],
  }
}

export function QuizApp() {
  const bridgeContext = useMemo(() => getPluginBridgeContext(), [])
  const [deck, setDeck] = useState(DEFAULT_DECK)
  const [progress, setProgress] = useState<QuizProgress>(() => buildInitialProgress(DEFAULT_DECK))
  const [teacherConnected, setTeacherConnected] = useState(false)
  const [teacherLabel, setTeacherLabel] = useState<string | null>(null)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [status, setStatus] = useState('Teacher can unlock quiz editing. Students can answer directly in the chat panel.')

  const currentQuestion = deck.questions[progress.currentIndex] ?? null

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
        deck: QuizDeck
        progress: QuizProgress
        teacherConnected: boolean
        teacherLabel: string | null
      }>
    ) => {
      const effectiveDeck = next?.deck ?? deck
      const effectiveProgress = next?.progress ?? progress
      sendToParent({
        type: 'state_update',
        summary,
        state: {
          quizTitle: effectiveDeck.title,
          teacher: next?.teacherLabel ?? teacherLabel,
          teacherConnected: next?.teacherConnected ?? teacherConnected,
          currentIndex: effectiveProgress.currentIndex,
          totalQuestions: effectiveDeck.questions.length,
          score: effectiveProgress.score,
          completed: effectiveProgress.completed,
          currentQuestion: effectiveDeck.questions[effectiveProgress.currentIndex] ?? null,
          answers: effectiveProgress.answers,
        },
      })
    },
    [deck, progress, sendToParent, teacherConnected, teacherLabel]
  )

  const connectTeacher = useCallback(() => {
    const normalized = passcodeInput.trim().toUpperCase()
    if (!normalized) {
      setStatus('Enter the teacher passcode to unlock quiz editing.')
      return
    }

    if (normalized !== DEFAULT_TEACHER_PASSCODE) {
      setStatus('That teacher passcode is incorrect.')
      return
    }

    setTeacherConnected(true)
    setTeacherLabel(DEFAULT_DECK.teacher)
    setPasscodeInput('')
    setStatus(`Teacher mode unlocked for ${DEFAULT_DECK.teacher}.`)
    sendToParent({
      type: 'credential_update',
      credential: {
        type: 'api_key',
        secret: DEFAULT_TEACHER_PASSCODE,
        label: DEFAULT_DECK.teacher,
      },
    })
    publishState(`Quiz teacher mode connected for ${DEFAULT_DECK.teacher}.`, {
      teacherConnected: true,
      teacherLabel: DEFAULT_DECK.teacher,
    })
  }, [passcodeInput, publishState, sendToParent])

  const disconnectTeacher = useCallback(() => {
    setTeacherConnected(false)
    setTeacherLabel(null)
    setStatus('Teacher mode disconnected.')
    sendToParent({
      type: 'credential_update',
      credential: null,
    })
    publishState('Teacher mode disconnected.', {
      teacherConnected: false,
      teacherLabel: null,
    })
  }, [publishState, sendToParent])

  const startQuiz = useCallback(
    (title?: string) => {
      const nextDeck = title?.trim() ? { ...deck, title: title.trim() } : deck
      const nextProgress = buildInitialProgress(nextDeck)
      setDeck(nextDeck)
      setProgress(nextProgress)
      setSelectedChoice(null)
      const summary = `Quiz ready: ${nextDeck.title}. Question 1 of ${nextDeck.questions.length}.`
      setStatus(summary)
      publishState(summary, {
        deck: nextDeck,
        progress: nextProgress,
      })
      return {
        quizTitle: nextDeck.title,
        question: nextDeck.questions[0],
        totalQuestions: nextDeck.questions.length,
      }
    },
    [deck, publishState]
  )

  const answerQuestion = useCallback(
    (choiceIndex: number) => {
      const question = deck.questions[progress.currentIndex]
      if (!question) {
        throw new Error('No active question.')
      }
      if (progress.completed) {
        throw new Error('The quiz is already complete.')
      }

      const correct = choiceIndex === question.correctIndex
      const nextProgress: QuizProgress = {
        currentIndex: progress.currentIndex + 1,
        score: progress.score + (correct ? 1 : 0),
        completed: progress.currentIndex + 1 >= deck.questions.length,
        answers: [
          ...progress.answers,
          {
            questionId: question.id,
            selectedIndex: choiceIndex,
            correct,
          },
        ],
      }

      setProgress(nextProgress)
      setSelectedChoice(choiceIndex)

      if (nextProgress.completed) {
        const summary = `Quiz complete. Score ${nextProgress.score} out of ${deck.questions.length}.`
        setStatus(summary)
        publishState(summary, { progress: nextProgress })
        sendToParent({
          type: 'completion',
          summary,
        })
      } else {
        const summary = correct
          ? `Correct. Moving to question ${nextProgress.currentIndex + 1}.`
          : `Not quite. Moving to question ${nextProgress.currentIndex + 1}.`
        setStatus(summary)
        publishState(summary, { progress: nextProgress })
      }

      return {
        correct,
        correctAnswer: question.choices[question.correctIndex],
        explanation: question.explanation,
        nextQuestion: nextProgress.completed ? null : deck.questions[nextProgress.currentIndex],
        score: nextProgress.score,
        completed: nextProgress.completed,
      }
    },
    [deck, progress, publishState, sendToParent]
  )

  const updateDeckTitle = useCallback(
    (title: string) => {
      if (!teacherConnected) {
        throw new Error('Teacher mode must be connected before editing the quiz.')
      }
      const trimmed = title.trim()
      if (!trimmed) {
        throw new Error('Provide a quiz title.')
      }

      const nextDeck = {
        ...deck,
        title: trimmed,
      }
      setDeck(nextDeck)
      setStatus(`Quiz title updated to ${trimmed}.`)
      publishState(`Quiz updated: ${trimmed}.`, { deck: nextDeck })
      return {
        quizTitle: trimmed,
        questionCount: nextDeck.questions.length,
      }
    },
    [deck, publishState, teacherConnected]
  )

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!bridgeContext) {
        return
      }

      if (isValidCredentialStateMessage(data, bridgeContext)) {
        if (data.credential?.type === 'api_key' && data.credential.secret === DEFAULT_TEACHER_PASSCODE) {
          setTeacherConnected(true)
          setTeacherLabel(data.credential.label ?? DEFAULT_DECK.teacher)
          setStatus(`Teacher mode unlocked for ${data.credential.label ?? DEFAULT_DECK.teacher}.`)
        } else {
          setTeacherConnected(false)
          setTeacherLabel(null)
        }
        return
      }

      if (
        isValidToolInvokeMessage(data, {
          ...bridgeContext,
          allowedTools: ['open_quiz', 'submit_answer', 'update_quiz_title'],
        })
      ) {
        void (async () => {
          try {
            if (data.toolName === 'open_quiz') {
              const result = startQuiz(typeof data.params?.title === 'string' ? data.params.title : undefined)
              sendToParent({
                type: 'tool_result',
                invocationId: data.invocationId,
                result,
                status: 'success',
              })
              return
            }

            if (data.toolName === 'submit_answer') {
              const choiceIndex = Number(data.params?.choiceIndex)
              if (!Number.isInteger(choiceIndex)) {
                throw new Error('Answer submissions need a numeric choiceIndex.')
              }
              const result = answerQuestion(choiceIndex)
              sendToParent({
                type: 'tool_result',
                invocationId: data.invocationId,
                result,
                status: 'success',
              })
              return
            }

            if (data.toolName === 'update_quiz_title') {
              const result = updateDeckTitle(String(data.params?.title ?? ''))
              sendToParent({
                type: 'tool_result',
                invocationId: data.invocationId,
                result,
                status: 'success',
              })
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Quiz request failed.'
            setStatus(message)
            sendToParent({
              type: 'tool_result',
              invocationId: data.invocationId,
              result: { error: message },
              status: 'error',
            })
          }
        })()
      } else if (isValidPingMessage(data, bridgeContext)) {
        sendToParent({ type: 'pong' })
      }
    }

    window.addEventListener('message', handleMessage)
    if (bridgeContext) {
      sendToParent({ type: 'ready' })
    }
    return () => window.removeEventListener('message', handleMessage)
  }, [answerQuestion, bridgeContext, sendToParent, startQuiz, updateDeckTitle])

  const currentChoiceResult =
    selectedChoice !== null && currentQuestion
      ? selectedChoice === currentQuestion.correctIndex
        ? 'Correct'
        : `Correct answer: ${currentQuestion.choices[currentQuestion.correctIndex]}`
      : null

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px',
        color: '#f9fafb',
        background: 'linear-gradient(160deg, #1d4ed8 0%, #0f172a 45%, #172554 100%)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '16px' }}>
        <div
          style={{
            borderRadius: '24px',
            padding: '24px',
            background: 'rgba(15, 23, 42, 0.82)',
            border: '1px solid rgba(191, 219, 254, 0.18)',
            boxShadow: '0 24px 70px rgba(0, 0, 0, 0.28)',
          }}
        >
          <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.75 }}>
            Authenticated Quiz App
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px' }}>{deck.title}</div>
          <div style={{ fontSize: '15px', marginTop: '10px', color: '#dbeafe' }}>{status}</div>
          <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '999px',
                background: teacherConnected ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)',
                color: teacherConnected ? '#86efac' : '#fecaca',
                border: '1px solid rgba(191,219,254,0.16)',
              }}
            >
              {teacherConnected ? `Teacher: ${teacherLabel ?? deck.teacher}` : 'Teacher mode locked'}
            </span>
            <span
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'rgba(59,130,246,0.16)',
                color: '#bfdbfe',
                border: '1px solid rgba(191,219,254,0.16)',
              }}
            >
              Score: {progress.score}/{deck.questions.length}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          <div
            style={{
              borderRadius: '20px',
              padding: '18px',
              background: 'rgba(15, 23, 42, 0.78)',
              border: '1px solid rgba(191, 219, 254, 0.14)',
              display: 'grid',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Teacher Login</div>
            <div style={{ fontSize: '13px', color: '#bfdbfe' }}>
              Use the teacher passcode to unlock editing. This is stored separately from the chat transcript.
            </div>
            <input
              type="password"
              value={passcodeInput}
              onChange={(event) => setPasscodeInput(event.target.value)}
              placeholder="Enter teacher passcode"
              style={{
                width: '100%',
                borderRadius: '12px',
                border: '1px solid rgba(191, 219, 254, 0.22)',
                background: 'rgba(15, 23, 42, 0.94)',
                color: '#f8fafc',
                padding: '12px 14px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={connectTeacher}
                style={{
                  border: 0,
                  borderRadius: '12px',
                  padding: '12px 14px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                  color: '#451a03',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Unlock Teacher Mode
              </button>
              <button
                onClick={disconnectTeacher}
                disabled={!teacherConnected}
                style={{
                  borderRadius: '12px',
                  padding: '12px 14px',
                  background: 'transparent',
                  color: '#dbeafe',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid rgba(191, 219, 254, 0.18)',
                }}
              >
                Disconnect
              </button>
            </div>
          </div>

          <div
            style={{
              borderRadius: '20px',
              padding: '18px',
              background: 'rgba(15, 23, 42, 0.78)',
              border: '1px solid rgba(191, 219, 254, 0.14)',
              display: 'grid',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Quiz Controls</div>
            <button
              onClick={() => startQuiz()}
              style={{
                border: 0,
                borderRadius: '12px',
                padding: '12px 14px',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: '#052e16',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Restart Quiz
            </button>
            <div style={{ fontSize: '13px', color: '#bfdbfe' }}>
              Teacher passcode for the demo: <strong>{DEFAULT_TEACHER_PASSCODE}</strong>
            </div>
          </div>
        </div>

        {currentQuestion && !progress.completed ? (
          <div
            style={{
              borderRadius: '22px',
              padding: '20px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(191, 219, 254, 0.14)',
              display: 'grid',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: '12px', opacity: 0.75 }}>
              Question {progress.currentIndex + 1} of {deck.questions.length}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700 }}>{currentQuestion.prompt}</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {currentQuestion.choices.map((choice, index) => (
                <button
                  key={choice}
                  onClick={() => {
                    setSelectedChoice(index)
                    void answerQuestion(index)
                  }}
                  style={{
                    textAlign: 'left',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    border: '1px solid rgba(191, 219, 254, 0.18)',
                    background: 'rgba(30, 41, 59, 0.82)',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontSize: '15px',
                  }}
                >
                  {String.fromCharCode(65 + index)}. {choice}
                </button>
              ))}
            </div>
            {currentChoiceResult && (
              <div style={{ fontSize: '14px', color: '#bfdbfe' }}>
                {currentChoiceResult}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              borderRadius: '22px',
              padding: '24px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(191, 219, 254, 0.14)',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 800 }}>Quiz Complete</div>
            <div style={{ marginTop: '10px', color: '#dbeafe' }}>
              Final score: {progress.score} out of {deck.questions.length}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
