import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Square } from 'chess.js'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { isValidPingMessage, isValidToolInvokeMessage } from '../bridge'
import { getPluginBridgeContext } from '../runtime'

type GameStatus = 'waiting' | 'playing' | 'checkmate' | 'stalemate' | 'draw'

export function ChessApp() {
  const [game, setGame] = useState(new Chess())
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white')
  const [status, setStatus] = useState<GameStatus>('playing')
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [possibleMoves, setPossibleMoves] = useState<Square[]>([])
  const [moveHistory, setMoveHistory] = useState<string[]>([])
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [isEmbedded, setIsEmbedded] = useState(false)
  const bridgeContextRef = useRef(getPluginBridgeContext())
  const gameRef = useRef(game)
  gameRef.current = game

  const cloneGame = useCallback((source: Chess) => {
    const cloned = new Chess(source.fen())
    const pgn = source.pgn()
    if (pgn) {
      cloned.loadPgn(pgn)
    }
    return cloned
  }, [])

  const sendToParent = useCallback((message: Record<string, unknown>) => {
    const bridgeContext = bridgeContextRef.current
    if (!bridgeContext) {
      return
    }
    window.parent.postMessage({ ...message, ...bridgeContext }, '*')
  }, [])

  const startNewGame = useCallback((color: 'white' | 'black' = 'white') => {
    const newGame = new Chess()
    setGame(newGame)
    setPlayerColor(color)
    setStatus('playing')
    setMoveHistory([])
    setLastMove(null)
    setSelectedSquare(null)
    setPossibleMoves([])
    return newGame
  }, [])

  const sendStateUpdate = useCallback(
    (currentGame: Chess) => {
      const turnColor = currentGame.turn() === 'w' ? 'White' : 'Black'
      let summary = `${turnColor}'s turn. Move ${Math.ceil(currentGame.moveNumber())}.`
      if (currentGame.isCheck()) {
        summary += ' Check!'
      }
      if (currentGame.isCheckmate()) {
        summary = `Checkmate! ${turnColor === 'White' ? 'Black' : 'White'} wins.`
      }
      if (currentGame.isStalemate()) {
        summary = 'Stalemate. Draw.'
      }
      if (currentGame.isDraw()) {
        summary = 'Draw.'
      }

      sendToParent({
        type: 'state_update',
        summary,
        state: {
          fen: currentGame.fen(),
          pgn: currentGame.pgn(),
          turn: currentGame.turn(),
          moveCount: currentGame.moveNumber(),
          isCheck: currentGame.isCheck(),
          isCheckmate: currentGame.isCheckmate(),
          isStalemate: currentGame.isStalemate(),
          isDraw: currentGame.isDraw(),
          moveHistory: currentGame.history(),
        },
      })
    },
    [sendToParent]
  )

  const handleGameOver = useCallback(
    (currentGame: Chess) => {
      let result = 'Draw'
      if (currentGame.isCheckmate()) {
        result = currentGame.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate'
      } else if (currentGame.isStalemate()) {
        result = 'Stalemate'
      }

      setStatus(currentGame.isCheckmate() ? 'checkmate' : currentGame.isStalemate() ? 'stalemate' : 'draw')
      sendToParent({
        type: 'completion',
        summary: `Game over: ${result}. Final position ${currentGame.fen()}.`,
      })
    },
    [sendToParent]
  )

  const makeAIMove = useCallback(
    (currentGame: Chess) => {
      const moves = currentGame.moves()
      if (!moves.length) {
        return
      }

      const captures = moves.filter((move) => move.includes('x'))
      const checks = moves.filter((move) => move.includes('+'))
      const preferred = [...checks, ...captures]
      const move =
        preferred.length > 0
          ? preferred[Math.floor(Math.random() * preferred.length)]
          : moves[Math.floor(Math.random() * moves.length)]

      const result = currentGame.move(move)
      if (!result) {
        return
      }

      const newGame = cloneGame(currentGame)
      setGame(newGame)
      setMoveHistory(newGame.history())
      setLastMove({ from: result.from as Square, to: result.to as Square })
      sendStateUpdate(newGame)

      if (newGame.isGameOver()) {
        handleGameOver(newGame)
      }
    },
    [cloneGame, sendStateUpdate, handleGameOver]
  )

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const bridgeContext = bridgeContextRef.current
      if (!bridgeContext) {
        return
      }

      const data = event.data
      if (
        isValidToolInvokeMessage(data, {
          ...bridgeContext,
          allowedTools: ['start_game', 'make_move', 'get_hint', 'get_board_state'],
        })
      ) {
        const { invocationId, toolName, params } = data

        switch (toolName) {
          case 'start_game': {
            const color = params?.playerColor === 'black' ? 'black' : 'white'
            const newGame = startNewGame(color)
            sendToParent({
              type: 'tool_result',
              invocationId,
              result: {
                message: `Chess game started. You play as ${color}.`,
                fen: newGame.fen(),
              },
              status: 'success',
            })
            sendStateUpdate(newGame)
            if (color === 'black') {
              setTimeout(() => makeAIMove(newGame), 500)
            }
            return
          }
          case 'make_move': {
            const move = typeof params?.move === 'string' ? params.move : ''
            const workingGame = cloneGame(gameRef.current)

            try {
              const result = workingGame.move(move)
              if (!result) {
                sendToParent({
                  type: 'tool_result',
                  invocationId,
                  result: { error: `Invalid move: ${move}` },
                  status: 'error',
                })
                return
              }

              setGame(workingGame)
              setMoveHistory(workingGame.history())
              setLastMove({ from: result.from as Square, to: result.to as Square })
              sendToParent({
                type: 'tool_result',
                invocationId,
                result: {
                  move: result.san,
                  fen: workingGame.fen(),
                },
                status: 'success',
              })
              sendStateUpdate(workingGame)

              if (workingGame.isGameOver()) {
                handleGameOver(workingGame)
              } else {
                setTimeout(() => makeAIMove(workingGame), 500)
              }
            } catch {
              sendToParent({
                type: 'tool_result',
                invocationId,
                result: { error: `Invalid move format: ${move}` },
                status: 'error',
              })
            }
            return
          }
          case 'get_hint': {
            const currentGame = gameRef.current
            const moves = currentGame.moves({ verbose: true })
            const captures = moves.filter((move) => move.captured)
            const checks = moves.filter((move) => move.san.includes('+'))
            const centerMoves = moves.filter((move) => ['d4', 'd5', 'e4', 'e5'].includes(move.to))
            const suggestion = checks[0] || captures[0] || centerMoves[0] || moves[0]
            sendToParent({
              type: 'tool_result',
              invocationId,
              result: {
                hint: suggestion ? `Consider ${suggestion.san} (${suggestion.from} to ${suggestion.to})` : 'No moves available',
                fen: currentGame.fen(),
                legalMoves: currentGame.moves(),
              },
              status: 'success',
            })
            return
          }
          case 'get_board_state': {
            const currentGame = gameRef.current
            sendToParent({
              type: 'tool_result',
              invocationId,
              result: {
                fen: currentGame.fen(),
                pgn: currentGame.pgn(),
                turn: currentGame.turn() === 'w' ? 'white' : 'black',
                moveNumber: currentGame.moveNumber(),
                moveHistory: currentGame.history(),
                isCheck: currentGame.isCheck(),
                isGameOver: currentGame.isGameOver(),
                legalMoves: currentGame.moves(),
              },
              status: 'success',
            })
            return
          }
        }
      } else if (isValidPingMessage(data, bridgeContext)) {
        sendToParent({ type: 'pong' })
      }
    },
    [cloneGame, handleGameOver, makeAIMove, sendStateUpdate, sendToParent, startNewGame]
  )

  useEffect(() => {
    const bridgeContext = getPluginBridgeContext()
    bridgeContextRef.current = bridgeContext
    setIsEmbedded(window.parent !== window && !!bridgeContext)
    window.addEventListener('message', handleMessage)

    if (bridgeContext) {
      sendToParent({ type: 'ready' })
    }

    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage, sendToParent])

  const onSquareClick = (square: Square) => {
    if (status !== 'playing') {
      setStatus('playing')
    }

    const isPlayerTurn =
      (game.turn() === 'w' && playerColor === 'white') || (game.turn() === 'b' && playerColor === 'black')
    if (!isPlayerTurn) {
      return
    }

    if (selectedSquare) {
      try {
        const workingGame = cloneGame(game)
        const result = workingGame.move({ from: selectedSquare, to: square, promotion: 'q' })
        if (result) {
          setGame(workingGame)
          setMoveHistory(workingGame.history())
          setLastMove({ from: result.from as Square, to: result.to as Square })
          setSelectedSquare(null)
          setPossibleMoves([])
          sendStateUpdate(workingGame)

          if (workingGame.isGameOver()) {
            handleGameOver(workingGame)
          } else {
            setTimeout(() => makeAIMove(workingGame), 500)
          }
          return
        }
      } catch {
        // fall through to piece selection
      }
    }

    const piece = game.get(square)
    if (piece && ((piece.color === 'w' && playerColor === 'white') || (piece.color === 'b' && playerColor === 'black'))) {
      setSelectedSquare(square)
      setPossibleMoves(game.moves({ square, verbose: true }).map((move) => move.to as Square))
    } else {
      setSelectedSquare(null)
      setPossibleMoves([])
    }
  }

  const onPieceDrop = (sourceSquare: string, targetSquare: string) => {
    const isPlayerTurn =
      (game.turn() === 'w' && playerColor === 'white') || (game.turn() === 'b' && playerColor === 'black')
    if (!isPlayerTurn) {
      return false
    }

    try {
      const workingGame = cloneGame(game)
      const result = workingGame.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: 'q',
      })

      if (!result) {
        return false
      }

      setGame(workingGame)
      setMoveHistory(workingGame.history())
      setLastMove({ from: result.from as Square, to: result.to as Square })
      setSelectedSquare(null)
      setPossibleMoves([])
      sendStateUpdate(workingGame)

      if (workingGame.isGameOver()) {
        handleGameOver(workingGame)
      } else {
        setTimeout(() => makeAIMove(workingGame), 500)
      }
      return true
    } catch {
      return false
    }
  }

  const customSquareStyles: Record<string, CSSProperties> = {}
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: 'rgba(99, 102, 241, 0.4)' }
  }
  for (const square of possibleMoves) {
    customSquareStyles[square] = {
      backgroundImage: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 25%, transparent 25%)',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
    }
  }
  if (lastMove) {
    customSquareStyles[lastMove.from] = {
      ...customSquareStyles[lastMove.from],
      backgroundColor: 'rgba(234, 179, 8, 0.2)',
    }
    customSquareStyles[lastMove.to] = {
      ...customSquareStyles[lastMove.to],
      backgroundColor: 'rgba(234, 179, 8, 0.3)',
    }
  }

  const turnText = game.turn() === 'w' ? 'White' : 'Black'
  const isPlayerTurn =
    (game.turn() === 'w' && playerColor === 'white') || (game.turn() === 'b' && playerColor === 'black')

  return (
    <div
      style={{
        fontFamily: '-apple-system, sans-serif',
        padding: '16px',
        background: '#1a1a2e',
        minHeight: '100vh',
        color: '#e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '14px',
          width: '100%',
          maxWidth: '400px',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            padding: '4px 12px',
            borderRadius: '999px',
            background: status === 'playing' ? (isPlayerTurn ? '#22c55e33' : '#eab30833') : '#ef444433',
            border: `1px solid ${status === 'playing' ? (isPlayerTurn ? '#22c55e' : '#eab308') : '#ef4444'}`,
            fontSize: '12px',
          }}
        >
          {status === 'waiting' && 'Waiting to start...'}
          {status === 'playing' && (isPlayerTurn ? 'Your turn' : 'AI thinking...')}
          {status === 'checkmate' && 'Checkmate'}
          {status === 'stalemate' && 'Stalemate'}
          {status === 'draw' && 'Draw'}
        </div>
        <span style={{ fontSize: '12px', opacity: 0.6 }}>
          Move {Math.ceil(game.moveNumber())} | {turnText}
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: '400px' }}>
        <Chessboard
          position={game.fen()}
          onSquareClick={onSquareClick}
          onPieceDrop={onPieceDrop}
          arePiecesDraggable={!isEmbedded}
          boardOrientation={playerColor}
          customSquareStyles={customSquareStyles}
          customBoardStyle={{
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          }}
          customDarkSquareStyle={{ backgroundColor: '#4a4a6a' }}
          customLightSquareStyle={{ backgroundColor: '#8888aa' }}
          animationDuration={200}
        />
      </div>

      {moveHistory.length > 0 && (
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            background: '#16162a',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            maxHeight: '80px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {moveHistory.map((move, index) => (
              <span key={`${move}-${index}`} style={{ opacity: 0.7 }}>
                {index % 2 === 0 && <strong style={{ opacity: 0.4 }}>{Math.floor(index / 2) + 1}.</strong>} {move}
              </span>
            ))}
          </div>
        </div>
      )}

      {isEmbedded && (
        <div style={{ width: '100%', maxWidth: '400px', fontSize: '12px', opacity: 0.7, textAlign: 'center' }}>
          Click a piece, then choose a destination square to play directly inside the chat.
        </div>
      )}
    </div>
  )
}
