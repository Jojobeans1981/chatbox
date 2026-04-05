# Testing Matrix

## Core Lifecycle

- User asks to use chess
  - Expected: chess tool opens inline and board renders
- User makes a move in chess
  - Expected: board updates and session state summary changes
- User asks for a hint mid-game
  - Expected: chess tool responds with a move suggestion
- User completes a quiz
  - Expected: score persists and completion summary is available to the chat
- User flips through flashcards
  - Expected: current card and flip state persist in plugin session state

## Auth

- Teacher opens Quiz Studio and approves teacher access
  - Expected: OAuth-style credential payload is stored outside transcript
- Teacher updates quiz title after auth
  - Expected: write succeeds only after authenticated mode is active

## Safety

- Unknown plugin route
  - Expected: safe fallback page
- Plugin fails to load
  - Expected: inline error state in host frame
- Plugin does not respond
  - Expected: host timeout and error surface

## Multi-App Conversation

- Start chess, then open flashcards in the same conversation
  - Expected: both app sessions remain trackable from the host
- Open quiz after another app
  - Expected: no loss of previous app state summaries
