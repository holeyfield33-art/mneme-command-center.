import { useEffect, useRef, useState } from 'react'
import { API_URL } from './api'

const RECONNECT_DELAY_MS = 2000

export default function useSSE() {
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState(null)
  const sourceRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  useEffect(() => {
    let isUnmounted = false

    const connect = () => {
      if (isUnmounted) return

      const source = new EventSource(`${API_URL}/events`)
      sourceRef.current = source

      source.onopen = () => {
        setIsConnected(true)
      }

      source.onerror = () => {
        setIsConnected(false)
        if (sourceRef.current) {
          sourceRef.current.close()
          sourceRef.current = null
        }

        if (!isUnmounted) {
          reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }

      source.onmessage = (messageEvent) => {
        try {
          const payload = JSON.parse(messageEvent.data)
          const event = {
            type: messageEvent.type || 'message',
            data: payload,
          }
          setLastEvent(event)
          window.dispatchEvent(new CustomEvent('mneme:sse', { detail: event }))
        } catch {
          // Ignore malformed payloads from transport noise.
        }
      }

      const eventTypes = [
        'task_created',
        'task_updated',
        'task_status_changed',
        'task_log_added',
        'approval_created',
        'approval_updated',
        'orchestration_enabled',
        'phase_started',
        'phase_completed',
        'phase_failed',
      ]

      eventTypes.forEach((eventType) => {
        source.addEventListener(eventType, (messageEvent) => {
          try {
            const payload = JSON.parse(messageEvent.data)
            const event = {
              type: eventType,
              data: payload,
            }
            setLastEvent(event)
            window.dispatchEvent(new CustomEvent('mneme:sse', { detail: event }))
          } catch {
            // Ignore malformed payloads from transport noise.
          }
        })
      })
    }

    connect()

    return () => {
      isUnmounted = true
      setIsConnected(false)
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      if (sourceRef.current) {
        sourceRef.current.close()
        sourceRef.current = null
      }
    }
  }, [])

  return { isConnected, lastEvent }
}
