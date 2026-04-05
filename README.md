# ChatBridge for TutorMeAI

ChatBridge is a K-12-focused AI chat platform built on top of a forked Chatbox host application. It lets the chat experience launch embedded learning apps, exchange structured state with those apps, and keep app context available in later turns.

## Live Demo

- Public demo: `https://renderer-zeta.vercel.app`
- Current app lineup:
  - `Chess`
  - `Quiz Studio`
  - `Flashcards`

## What This Project Demonstrates

- Streaming chat host built on Chatbox
- Embedded third-party-style apps rendered inside the conversation UI
- Structured tool schemas that the host exposes to the model
- Bidirectional postMessage contract between host and app iframe
- Per-conversation app session state persistence
- Completion signaling back into the chat flow
- Authenticated classroom app flow via OAuth-style credential state in Quiz Studio
- K-12-oriented visual design and content-safe built-in app set

## Architecture

Core host integration:

- [stream-text.ts](./src/renderer/packages/model-calls/stream-text.ts)
- [toolset.ts](./src/renderer/plugins/toolset.ts)
- [PluginFrame.tsx](./src/renderer/components/plugins/PluginFrame.tsx)
- [ToolCallPartUI.tsx](./src/renderer/components/message-parts/ToolCallPartUI.tsx)
- [session.ts](./src/shared/types/session.ts)

Plugin registry and contract:

- [manifests.ts](./src/renderer/plugins/manifests.ts)
- [registry.ts](./src/renderer/plugins/registry.ts)
- [types.ts](./src/renderer/plugins/types.ts)
- [bridge.ts](./src/renderer/plugins/bridge.ts)

Embedded app routes:

- [\$pluginId.tsx](./src/renderer/routes/plugins/$pluginId.tsx)
- [ChessApp.tsx](./src/renderer/plugins/apps/ChessApp.tsx)
- [QuizApp.tsx](./src/renderer/plugins/apps/QuizApp.tsx)
- [FlashcardsApp.tsx](./src/renderer/plugins/apps/FlashcardsApp.tsx)

## Docs

- [Architecture Overview](./docs/chatbridge-architecture.md)
- [Plugin API Contract](./docs/chatbridge-plugin-api.md)
- [Pre-Search and Case Study Analysis](./docs/pre-search.md)
- [AI Cost Analysis](./docs/ai-cost-analysis.md)
- [Testing Matrix](./docs/testing-matrix.md)

## Local Setup

1. Install dependencies with `pnpm install`
2. Use Node `20`, `21`, or `22`
3. Run the web build with `npm run build:web`
4. Run the host in your preferred Chatbox development mode

Note: the project enforces `engines.node >=20 <23`. Builds can finish on newer Node versions, but the final engine check will fail.

## Submission Notes

- This repo is intentionally positioned as a TutorMeAI / ChatBridge submission rather than a generic Chatbox clone.
- The public demo opens directly into a K-12 app launcher so reviewers do not need to configure an AI provider first.
- Quiz Studio uses an OAuth-style classroom credential payload and token refresh simulation inside the host-app contract to demonstrate authenticated app behavior in the embedded flow.
