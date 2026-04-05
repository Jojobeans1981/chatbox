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
const QUIZ_OAUTH_SCOPE = ['quiz.read', 'quiz.write']
const QUIZ_TOKEN_LIFETIME_MS = 60 * 60 * 1000

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
  const [tokenExpiryLabel, setTokenExpiryLabel] = useState<string | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [status, setStatus] = useState('Teachers can sign in to Quiz Studio. Students can answer directly in the chat panel.')

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
    const expiresAt = Date.now() + QUIZ_TOKEN_LIFETIME_MS
    setTokenExpiryLabel(new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    setStatus(`Teacher OAuth session approved for ${DEFAULT_DECK.teacher}.`)
    sendToParent({
      type: 'credential_update',
      credential: {
        type: 'oauth2',
        label: DEFAULT_DECK.teacher,
        accessToken: `quiz_access_${DEFAULT_TEACHER_PASSCODE}`,
        refreshToken: 'quiz_refresh_demo_token',
        expiresAt,
        scopes: QUIZ_OAUTH_SCOPE,
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
    setTokenExpiryLabel(null)
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
        if (data.credential?.type === 'oauth2' && data.credential.accessToken) {
          setTeacherConnected(true)
          setTeacherLabel(data.credential.label ?? DEFAULT_DECK.teacher)
          setTokenExpiryLabel(
            typeof data.credential.expiresAt === 'number'
              ? new Date(data.credential.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              : null
          )
          setStatus(`Teacher OAuth session approved for ${data.credential.label ?? DEFAULT_DECK.teacher}.`)
        } else {
          setTeacherConnected(false)
          setTeacherLabel(null)
          setTokenExpiryLabel(null)
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

  useEffect(() => {
    if (!teacherConnected) {
      return
    }
    const intervalId = window.setInterval(() => {
      sendToParent({
        type: 'credential_update',
        credential: {
          type: 'oauth2',
          label: teacherLabel ?? DEFAULT_DECK.teacher,
          accessToken: `quiz_access_${DEFAULT_TEACHER_PASSCODE}`,
          refreshToken: 'quiz_refresh_demo_token',
          expiresAt: Date.now() + QUIZ_TOKEN_LIFETIME_MS,
          scopes: QUIZ_OAUTH_SCOPE,
        },
      })
    }, QUIZ_TOKEN_LIFETIME_MS / 2)

    return () => window.clearInterval(intervalId)
  }, [sendToParent, teacherConnected, teacherLabel])

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
        color: '#0f172a',
        background:
          'radial-gradient(circle at top left, rgba(34, 197, 94, 0.16), transparent 24%), radial-gradient(circle at top right, rgba(56, 189, 248, 0.16), transparent 28%), linear-gradient(180deg, #f0fdf4 0%, #ffffff 44%, #eff6ff 100%)',
        fontFamily: '"Trebuchet MS", "Avenir Next", sans-serif',
      }}
    >
      <div style={{ maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '16px' }}>
        <div
          style={{
            borderRadius: '30px',
            padding: '24px',
            background: 'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 55%, #2563eb 100%)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            boxShadow: '0 24px 70px rgba(14, 165, 233, 0.18)',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.75 }}>
            Classroom Check-In
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px' }}>{deck.title}</div>
          <div style={{ fontSize: '15px', marginTop: '10px', color: 'rgba(255,255,255,0.92)' }}>{status}</div>
          <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '999px',
                background: teacherConnected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.16)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.22)',
              }}
            >
              {teacherConnected ? `Teacher: ${teacherLabel ?? deck.teacher}` : 'Teacher mode locked'}
            </span>
            <span
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.18)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.22)',
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
              borderRadius: '24px',
              padding: '18px',
              background: '#ffffff',
              border: '1px solid rgba(148, 163, 184, 0.16)',
              display: 'grid',
              gap: '12px',
              boxShadow: '0 16px 34px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Teacher Sign-In</div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              Use the classroom approval code to simulate an OAuth classroom sign-in. Tokens stay separate from the
              chat transcript.
            </div>
            <input
              type="password"
              value={passcodeInput}
              onChange={(event) => setPasscodeInput(event.target.value)}
              placeholder="Enter classroom approval code"
              style={{
                width: '100%',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: '#f8fafc',
                color: '#0f172a',
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
                  borderRadius: '14px',
                  padding: '12px 14px',
                  background: 'linear-gradient(135deg, #22c55e 0%, #0ea5e9 100%)',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 12px 24px rgba(14, 165, 233, 0.2)',
                }}
              >
                Approve Teacher Access
              </button>
              <button
                onClick={disconnectTeacher}
                disabled={!teacherConnected}
                style={{
                  borderRadius: '14px',
                  padding: '12px 14px',
                  background: 'transparent',
                  color: '#334155',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                }}
              >
                Disconnect
              </button>
            </div>
          </div>

          <div
            style={{
              borderRadius: '24px',
              padding: '18px',
              background: '#ffffff',
              border: '1px solid rgba(148, 163, 184, 0.16)',
              display: 'grid',
              gap: '12px',
              boxShadow: '0 16px 34px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Session Controls</div>
            <button
              onClick={() => startQuiz()}
              style={{
                border: 0,
                borderRadius: '14px',
                padding: '12px 14px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 12px 24px rgba(249, 115, 22, 0.18)',
              }}
            >
              Restart Quiz
            </button>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              Demo classroom approval code: <strong>{DEFAULT_TEACHER_PASSCODE}</strong>
            </div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              OAuth scopes: <strong>{QUIZ_OAUTH_SCOPE.join(', ')}</strong>
              {tokenExpiryLabel ? ` · token refreshes until ${tokenExpiryLabel}` : ''}
            </div>
          </div>
        </div>

        {currentQuestion && !progress.completed ? (
          <div
            style={{
              borderRadius: '26px',
              padding: '20px',
              background: '#ffffff',
              border: '1px solid rgba(148, 163, 184, 0.16)',
              display: 'grid',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div style={{ fontSize: '12px', opacity: 0.7, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Question {progress.currentIndex + 1} of {deck.questions.length}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{currentQuestion.prompt}</div>
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
                    borderRadius: '16px',
                    padding: '14px 16px',
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                    color: '#0f172a',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 700,
                  }}
                >
                  {String.fromCharCode(65 + index)}. {choice}
                </button>
              ))}
            </div>
            {currentChoiceResult && (
              <div style={{ fontSize: '14px', color: '#0f766e', fontWeight: 700 }}>
                {currentChoiceResult}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              borderRadius: '26px',
              padding: '24px',
              background: 'linear-gradient(135deg, #ecfeff 0%, #eff6ff 100%)',
              border: '1px solid rgba(14, 165, 233, 0.14)',
            }}
          >
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>Quiz Complete</div>
            <div style={{ marginTop: '10px', color: '#475569' }}>
              Final score: {progress.score} out of {deck.questions.length}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
