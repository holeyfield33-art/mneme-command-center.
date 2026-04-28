import React, { useMemo, useState } from 'react'

const DEFAULT_TEMPLATES = [
  {
    id: 'refactor',
    label: 'Refactor',
    title: 'Refactor target module',
    description: 'Refactor the selected code path for readability, maintainability, and lower complexity while preserving behavior.',
  },
  {
    id: 'add-tests',
    label: 'Add Tests',
    title: 'Add tests for recent changes',
    description: 'Create or extend automated tests that cover the intended behavior and edge cases for the updated code.',
  },
  {
    id: 'document',
    label: 'Document',
    title: 'Document feature behavior',
    description: 'Write concise technical documentation that explains usage, configuration, and known limitations.',
  },
  {
    id: 'explain-code',
    label: 'Explain Code',
    title: 'Explain implementation details',
    description: 'Analyze the relevant code and provide a clear explanation of architecture, data flow, and tradeoffs.',
  },
]

export default function TaskForm({ onSubmit, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    mode: 'interactive',
    risk_level: 'medium',
  })
  const [templateId, setTemplateId] = useState('')
  const [isListening, setIsListening] = useState(false)

  const SpeechRecognition = useMemo(() => {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
  }, [])

  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const applyTemplate = (nextTemplateId) => {
    setTemplateId(nextTemplateId)
    const selected = DEFAULT_TEMPLATES.find((template) => template.id === nextTemplateId)
    if (!selected) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      title: selected.title,
      description: selected.description,
    }))
  }

  const startVoiceInput = () => {
    if (!SpeechRecognition) {
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || ''
      if (transcript.trim()) {
        setField('description', transcript.trim())
      }
    }

    recognition.start()
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const title = formData.title.trim()
    const description = formData.description.trim()
    const objective = title && description ? `${title}: ${description}` : title || description

    onSubmit({
      objective,
      mode: formData.mode,
      risk_level: formData.risk_level,
    })
  }

  return (
    <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Template</label>
          <select
            value={templateId}
            onChange={(event) => applyTemplate(event.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          >
            <option value="">Custom task</option>
            {DEFAULT_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>{template.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Title *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(event) => setField('title', event.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Description *</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
            <textarea
              value={formData.description}
              onChange={(event) => setField('description', event.target.value)}
              required
              rows="4"
              placeholder="Tap microphone, speak your task"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
                fontFamily: 'monospace'
              }}
            />
            <button
              type="button"
              onClick={startVoiceInput}
              disabled={!SpeechRecognition || isListening}
              title={SpeechRecognition ? 'Tap to speak' : 'Speech recognition unavailable in this browser'}
              style={{
                minWidth: '48px',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: isListening ? '#e7f3ff' : '#fff',
                cursor: SpeechRecognition ? 'pointer' : 'not-allowed',
                opacity: SpeechRecognition ? 1 : 0.65,
                fontSize: '1.1rem'
              }}
            >
              {isListening ? '●' : '🎤'}
            </button>
          </div>
          {!SpeechRecognition && (
            <div style={{ marginTop: '0.5rem', color: '#777', fontSize: '0.9rem' }}>
              Tap microphone, speak your task
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Mode</label>
            <select
              value={formData.mode}
              onChange={(event) => setField('mode', event.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            >
              <option value="interactive">Interactive</option>
              <option value="autonomous">Autonomous</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Risk Level</label>
            <select
              value={formData.risk_level}
              onChange={(event) => setField('risk_level', event.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Task'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
