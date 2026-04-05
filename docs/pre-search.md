# Pre-Search

## Case Study Analysis

TutorMeAI’s case study is really about trust boundaries, not just chat UX. The chatbot already works. The hard part is letting outside applications live inside the chat without breaking the learning experience, leaking student data, or making the assistant lose track of what is happening. The first key problem is control. Third-party apps want freedom over their UI and internal state, but the host platform still needs enough structure to discover tools, invoke them safely, and understand what happened after the interaction. That trade-off pushes the architecture toward a narrow, explicit contract: apps should control their own presentation and state, while the host controls registration, invocation, identity, safety checks, and session persistence. The second key problem is context continuity. A useful educational flow means the app cannot feel like a detached widget. If a student plays chess, answers a quiz, or flips through flashcards, the chatbot needs a summary of the active state so it can respond naturally in later turns. That led to a design where apps emit structured state updates and completion events, and the host persists a session summary per embedded app. The third key problem is safety for children. In a K-12 product, “can this technically run?” is not enough. The platform needs a contract that assumes every embedded app could be buggy, misleading, or overly permissive. That means sandboxing the iframe, restricting the message protocol, rating content, separating credentials from the transcript, and keeping the host in control of which apps are exposed. Another important trade-off is breadth versus reliability. A flashy marketplace with weak boundaries would look impressive but fail the actual case study. A smaller set of deeply integrated apps demonstrates the harder engineering problem more convincingly. That is why the project emphasizes three different app patterns: chess for ongoing shared state, flashcards for lightweight study interaction, and quiz for authenticated classroom control. On authentication, the ethical concern is avoiding designs that teach bad security habits or expose student-facing users to confusing credential flows. The safer product choice is to keep student interactions simple and isolate teacher-only actions behind a separate authenticated mode. Finally, there is a product-language decision. Because the audience is K-12, the interface should feel welcoming and school-appropriate rather than like a generic power-user AI shell. The host experience therefore needs to frame apps as learning activities, not just arbitrary developer widgets. The final direction I landed on is a conversation-first host with embedded, sandboxed learning apps, a structured plugin manifest, tool invocation and completion signaling, app state summaries stored per chat session, a K-12-safe app set, and a separate credential channel for authenticated classroom actions. That combination best addresses the case study’s main risks while still being practical to ship inside a one-week sprint.

## Constraints

- One-week delivery window
- Must build on top of forked Chatbox
- K-12 audience requires stronger trust/safety posture
- Public demo must work without reviewer configuration
- Need 3 differentiated apps, with Chess required

## Architecture Decisions

- Host shell: Chatbox fork
- Embedded app surface: iframe-based plugin routes
- Messaging: `postMessage` with strict identity fields
- App state retention: persisted in `activePlugins`
- Auth: credential channel kept separate from transcript
- Public demo: launcher-first UX to avoid provider setup blockers

## Trade-Offs

- Bundled built-in apps were favored over a broad remote marketplace for reliability
- The model tool surface is dynamic from registered manifests, but app loading remains host-curated for safety
- Auth was implemented as an OAuth-style contract inside the plugin system so the architecture is compatible with real external providers later
