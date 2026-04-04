import { useCallback, useEffect, useMemo, useState } from 'react'
import { isValidPingMessage, isValidToolInvokeMessage } from '../bridge'
import { getPluginBridgeContext } from '../runtime'

type WeatherResult = {
  city: string
  temperatureC: number
  condition: string
  humidity: number
  windKph: number
}

function hashCity(input: string) {
  return Array.from(input).reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function generateDemoWeather(city: string): WeatherResult {
  const seed = hashCity(city.toLowerCase())
  const conditions = ['Sunny', 'Cloudy', 'Rain Showers', 'Windy', 'Partly Cloudy', 'Stormy']
  return {
    city,
    temperatureC: 12 + (seed % 19),
    condition: conditions[seed % conditions.length],
    humidity: 42 + (seed % 45),
    windKph: 6 + (seed % 24),
  }
}

export function WeatherApp() {
  const [city, setCity] = useState('Chicago')
  const [weather, setWeather] = useState<WeatherResult | null>(null)
  const [status, setStatus] = useState('Waiting for a city...')
  const bridgeContext = useMemo(() => getPluginBridgeContext(), [])

  const sendToParent = useCallback(
    (message: Record<string, unknown>) => {
      if (!bridgeContext) {
        return
      }
      window.parent.postMessage({ ...message, ...bridgeContext }, '*')
    },
    [bridgeContext]
  )

  const loadWeather = useCallback(
    (cityName: string, invocationId?: string) => {
      const trimmed = cityName.trim()
      if (!trimmed) {
        const error = 'Enter a city name.'
        setStatus(error)
        if (invocationId) {
          sendToParent({
            type: 'tool_result',
            invocationId,
            result: { error },
            status: 'error',
          })
        }
        return
      }

      const result = generateDemoWeather(trimmed)
      setWeather(result)
      setStatus(`${result.condition}, ${result.temperatureC}C in ${result.city}`)

      if (invocationId) {
        sendToParent({
          type: 'tool_result',
          invocationId,
          result,
          status: 'success',
        })
      }

      sendToParent({
        type: 'state_update',
        summary: `${result.city}: ${result.condition}, ${result.temperatureC}C`,
        state: result,
      })
    },
    [sendToParent]
  )

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!bridgeContext) {
        return
      }

      if (
        isValidToolInvokeMessage(data, {
          ...bridgeContext,
          allowedTools: ['get_weather'],
        }) &&
        data.toolName === 'get_weather'
      ) {
        loadWeather(String(data.params?.city ?? ''), data.invocationId)
      } else if (isValidPingMessage(data, bridgeContext)) {
        sendToParent({ type: 'pong' })
      }
    }

    window.addEventListener('message', handleMessage)
    if (bridgeContext) {
      sendToParent({ type: 'ready' })
    }
    return () => window.removeEventListener('message', handleMessage)
  }, [bridgeContext, loadWeather, sendToParent])

  useEffect(() => {
    if (window.parent === window || !bridgeContext) {
      loadWeather(city)
    }
  }, [bridgeContext, city, loadWeather])

  const cards = [
    { label: 'Temperature', value: weather ? `${weather.temperatureC}C` : '--' },
    { label: 'Humidity', value: weather ? `${weather.humidity}%` : '--' },
    { label: 'Wind', value: weather ? `${weather.windKph} km/h` : '--' },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px',
        color: '#ecfeff',
        background: 'radial-gradient(circle at top, #164e63 0%, #0f172a 60%)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: '420px', margin: '0 auto', display: 'grid', gap: '16px' }}>
        <div
          style={{
            borderRadius: '22px',
            padding: '22px',
            background: 'rgba(8, 47, 73, 0.55)',
            border: '1px solid rgba(103, 232, 249, 0.2)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.32)',
          }}
        >
          <div style={{ fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75 }}>
            Weather
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, marginTop: '10px' }}>{weather?.city ?? 'Weather Board'}</div>
          <div style={{ fontSize: '15px', marginTop: '10px', opacity: 0.84 }}>{status}</div>
        </div>

        <div
          style={{
            borderRadius: '20px',
            padding: '16px',
            background: 'rgba(15, 23, 42, 0.66)',
            border: '1px solid rgba(103, 232, 249, 0.16)',
            display: 'grid',
            gap: '12px',
          }}
        >
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Enter a city"
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#f8fafc',
              padding: '12px 14px',
              fontSize: '15px',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => loadWeather(city)}
            style={{
              border: 0,
              borderRadius: '12px',
              padding: '12px 14px',
              background: 'linear-gradient(135deg, #22d3ee 0%, #0ea5e9 100%)',
              color: '#082f49',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Check Weather
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {cards.map((card) => (
            <div
              key={card.label}
              style={{
                borderRadius: '16px',
                padding: '14px',
                background: 'rgba(15, 23, 42, 0.66)',
                border: '1px solid rgba(103, 232, 249, 0.12)',
              }}
            >
              <div style={{ fontSize: '11px', opacity: 0.65 }}>{card.label}</div>
              <div style={{ marginTop: '8px', fontSize: '16px', fontWeight: 700 }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
