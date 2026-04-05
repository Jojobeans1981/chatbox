# ChatBridge Architecture Overview

## Summary

ChatBridge is a conversation-first plugin platform built inside a forked Chatbox host. The host application remains the primary surface. Learning tools are embedded as sandboxed iframe apps that exchange structured messages with the host through a narrow postMessage contract.

## Host Responsibilities

- Maintain persistent chat sessions and message history
- Expose tool schemas to the model at runtime
- Decide when to open or invoke an embedded app
- Render embedded app UI inline inside the chat transcript
- Persist app state summaries and structured snapshots back into the conversation session
- Store app credentials separately from the transcript
- Resume follow-up turns with app context attached

## App Responsibilities

- Render their own interface within an iframe route
- Listen for `tool_invoke`, `ping`, and `credential_state`
- Emit `ready`, `tool_result`, `state_update`, `completion`, and `credential_update`
- Maintain app-local state independently from the host transcript

## Key Data Flow

1. The model receives the built-in plugin tool descriptions.
2. The user requests an app capability such as chess, flashcards, or a quiz.
3. The host invokes the matching tool in [toolset.ts](../src/renderer/plugins/toolset.ts).
4. If the tool opens UI, the host creates or reuses a `PluginSession`.
5. The message renderer sees the tool result and mounts [PluginFrame.tsx](../src/renderer/components/plugins/PluginFrame.tsx).
6. The iframe app boots, sends `ready`, and begins receiving invocations or credentials.
7. The app emits `state_update` and `completion` events.
8. The host persists those updates into `activePlugins` on the session object.
9. Later turns can include active app summaries in the tool instructions and prompt context.

## Safety Model

- Only `everyone`-rated plugins are exposed to the default model toolset
- Each plugin carries explicit origin and sandbox policy metadata
- The iframe checks plugin identity via `pluginId`, `sessionId`, and `capabilityToken`
- Credentials are stored outside the chat transcript in plugin-scoped storage
- The demo app set is bundled and controlled by the host rather than loaded from arbitrary remote origins

## Auth Model

Quiz Studio demonstrates an authenticated plugin category. The host/plugin contract supports `oauth2` credential payloads with:

- `accessToken`
- `refreshToken`
- `expiresAt`
- `scopes`
- `label`

This allows the platform layer to treat authenticated apps differently from public or internal apps.

## Why This Fits the Case Study

- Chess demonstrates long-lived, stateful interaction
- Flashcards demonstrates lightweight study interaction
- Quiz Studio demonstrates classroom auth and teacher-only controls
- All three remain inside the same chat shell, which is the main product requirement in the TutorMeAI case study
