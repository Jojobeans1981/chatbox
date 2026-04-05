import type { PluginManifest } from './types'

const registeredPlugins = new Map<string, PluginManifest>()

function normalizePluginManifest(plugin: PluginManifest): PluginManifest {
  return {
    ...plugin,
    developerName: plugin.developerName ?? 'TutorMeAI Platform',
    originPolicy: {
      trustedHosts: plugin.originPolicy?.trustedHosts ?? ['self'],
      sandboxPermissions: plugin.originPolicy?.sandboxPermissions ?? [
        'allow-scripts',
        'allow-forms',
        'allow-same-origin',
      ],
    },
  }
}

export function registerPlugin(plugin: PluginManifest) {
  if (!plugin.id.trim()) {
    throw new Error('Plugin id is required.')
  }
  if (registeredPlugins.has(plugin.id)) {
    throw new Error(`Plugin ${plugin.id} is already registered.`)
  }
  registeredPlugins.set(plugin.id, normalizePluginManifest(plugin))
}

export function registerPlugins(plugins: PluginManifest[]) {
  plugins.forEach(registerPlugin)
}

export function getRegisteredPlugins() {
  return Array.from(registeredPlugins.values())
}

export function getRegisteredSafePlugins() {
  return getRegisteredPlugins().filter((plugin) => plugin.contentRating === 'everyone')
}

export function getRegisteredPluginById(pluginId: string) {
  return registeredPlugins.get(pluginId)
}

export function clearRegisteredPlugins() {
  registeredPlugins.clear()
}
