import type { PluginManifest } from './types'

export const builtinChessPlugin: PluginManifest = {
  id: 'chess',
  name: 'Chess',
  description: 'Play a game of chess with an interactive board, legal move validation, and move hints.',
  version: '1.0.0',
  iframeUrl: '/plugins/chess',
  authType: 'none',
  contentRating: 'everyone',
  tools: [
    {
      name: 'start_game',
      description: 'Start a new chess game. The user plays as white by default.',
      parameters: {
        type: 'object',
        properties: {
          playerColor: {
            type: 'string',
            enum: ['white', 'black'],
            description: 'The color the user plays as. Defaults to white.',
          },
        },
      },
      rendersUI: true,
      completionEvent: 'game_over',
    },
    {
      name: 'make_move',
      description: 'Make a chess move in algebraic notation, for example "e4" or "Nf3".',
      parameters: {
        type: 'object',
        properties: {
          move: {
            type: 'string',
            description: 'The move in standard algebraic notation.',
          },
        },
        required: ['move'],
      },
      rendersUI: false,
    },
    {
      name: 'get_hint',
      description: 'Suggest a strong move for the current chess position.',
      parameters: {
        type: 'object',
        properties: {},
      },
      rendersUI: false,
    },
    {
      name: 'get_board_state',
      description: 'Return the current board state, including FEN and move history.',
      parameters: {
        type: 'object',
        properties: {},
      },
      rendersUI: false,
    },
  ],
}

export const builtinFlashcardsPlugin: PluginManifest = {
  id: 'flashcards',
  name: 'Flashcards',
  description: 'Review a study deck inside chat with card flipping and lightweight deck navigation.',
  version: '1.0.0',
  iframeUrl: '/plugins/flashcards',
  authType: 'none',
  contentRating: 'everyone',
  tools: [
    {
      name: 'open_deck',
      description: 'Open the flashcards app and optionally focus the deck on a study topic.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Optional study topic to label the flashcard deck.',
          },
        },
      },
      rendersUI: true,
    },
    {
      name: 'flip_card',
      description: 'Flip the current flashcard to reveal the answer side.',
      parameters: {
        type: 'object',
        properties: {},
      },
      rendersUI: false,
    },
    {
      name: 'next_card',
      description: 'Advance to the next flashcard in the deck.',
      parameters: {
        type: 'object',
        properties: {},
      },
      rendersUI: false,
    },
  ],
}

export const builtinQuizPlugin: PluginManifest = {
  id: 'quiz',
  name: 'Quiz Studio',
  description:
    'Launch a classroom quiz inside chat, let students answer questions, and unlock teacher editing with an authenticated passcode.',
  version: '1.0.0',
  iframeUrl: '/plugins/quiz',
  authType: 'api_key',
  contentRating: 'everyone',
  tools: [
    {
      name: 'open_quiz',
      description: 'Open the quiz app and optionally set the visible quiz title.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Optional quiz title to display when the app opens.',
          },
        },
      },
      rendersUI: true,
    },
    {
      name: 'submit_answer',
      description:
        'Submit an answer for the current multiple-choice question and receive correctness feedback.',
      parameters: {
        type: 'object',
        properties: {
          choiceIndex: {
            type: 'integer',
            description: 'The zero-based answer choice index selected by the student.',
          },
        },
        required: ['choiceIndex'],
      },
      rendersUI: false,
    },
    {
      name: 'update_quiz_title',
      description:
        'Update the quiz title from the teacher side. Requires teacher authentication inside the app first.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The updated quiz title.',
          },
        },
        required: ['title'],
      },
      rendersUI: false,
    },
  ],
}

const BUILTIN_PLUGINS = [builtinChessPlugin, builtinFlashcardsPlugin, builtinQuizPlugin]

export function getBuiltinPlugins() {
  return BUILTIN_PLUGINS
}

export function getSafeBuiltinPlugins() {
  return BUILTIN_PLUGINS.filter((plugin) => plugin.contentRating === 'everyone')
}

export function getPluginById(pluginId: string) {
  return BUILTIN_PLUGINS.find((plugin) => plugin.id === pluginId)
}
