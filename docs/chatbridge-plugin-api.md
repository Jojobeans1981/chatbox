# ChatBridge Plugin API Contract

## Manifest Shape

Each plugin registers a `PluginManifest` with:

- `id`
- `name`
- `description`
- `version`
- `iframeUrl`
- `developerName`
- `authType`
- `contentRating`
- `tools`
- `originPolicy`
- `authConfig`

See [types.ts](../src/renderer/plugins/types.ts) and [manifests.ts](../src/renderer/plugins/manifests.ts).

## Registration

Plugins are registered through the registry layer:

- `registerPlugin(plugin)`
- `registerPlugins(plugins)`
- `getRegisteredPlugins()`
- `getRegisteredSafePlugins()`

See [registry.ts](../src/renderer/plugins/registry.ts).

## Tool Definition

Each tool includes:

- `name`
- `description`
- `parameters`
- `rendersUI`
- `completionEvent`

Tools are injected into the model toolset through [toolset.ts](../src/renderer/plugins/toolset.ts).

## Host to Plugin Messages

- `tool_invoke`
- `ping`
- `credential_state`

## Plugin to Host Messages

- `ready`
- `tool_result`
- `state_update`
- `completion`
- `credential_update`
- `pong`

See [bridge.ts](../src/renderer/plugins/bridge.ts).

## Credential Payloads

Supported credential types:

- `api_key`
- `oauth2`

`oauth2` payload fields:

- `accessToken`
- `refreshToken`
- `expiresAt`
- `scopes`
- `label`

Credentials are stored via [credentials.ts](../src/renderer/plugins/credentials.ts), not inside the transcript.

## Sandbox Policy

Each plugin can declare:

- `trustedHosts`
- `sandboxPermissions`

The host applies those permissions in [PluginFrame.tsx](../src/renderer/components/plugins/PluginFrame.tsx).

## Minimal Plugin Lifecycle

1. Register a manifest
2. Expose at least one tool
3. Provide an iframe route
4. On load, send `ready`
5. Handle `tool_invoke`
6. Emit `state_update` as the UI changes
7. Emit `completion` when the interaction is done

## Included Reference Apps

- Chess: long-running board state
- Quiz Studio: authenticated classroom app
- Flashcards: lightweight learning loop
