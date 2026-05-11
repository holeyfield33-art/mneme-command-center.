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
    model_provider: '',
    model_name: '',
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
    if (!selected) return
    setFormData((prev) => ({ ...prev, title: selected.title, description: selected.description }))
  }

  const startVoiceInput = () => {
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || ''
      if (transcript.trim()) setField('description', transcript.trim())
    }
    recognition.start()
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const title = formData.title.trim()
    const description = formData.description.trim()
    const objective = title && description ? `${title}: ${description}` : title || description
    const payload = { objective, mode: formData.mode, risk_level: formData.risk_level }
    if (formData.model_provider) payload.model_provider = formData.model_provider
    if (formData.model_name) payload.model_name = formData.model_name
    onSubmit(payload)
  }

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid var(--mneme-border)',
    borderRadius: '6px',
    boxSizing: 'border-box',
    backgroundColor: 'var(--mneme-surface)',
    color: 'var(--mneme-ink)'
  }

  return (
    <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: 'var(--mneme-surface)', borderRadius: '10px', border: '1px solid var(--mneme-border)' }}>
      <form onSubmit={handleSubmit}>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Template</label>
          <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} style={inputStyle}>
            <option value="">Custom task</option>
            {DEFAULT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Title</label>
          <input type="text" value={formData.title} onChange={(e) => setField('title', e.target.value)} placeholder="Short task title" style={inputStyle} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Description</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
            <textarea
              value={formData.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Describe what the agent should do…"
              rows={4}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
            <button
              type="button"
              onClick={startVoiceInput}
              disabled={!SpeechRecognition || isListening}
              title={SpeechRecognition ? 'Tap to speak' : 'Speech recognition unavailable in this browser'}
              style={{
                minWidth: '48px', padding: '0.75rem', border: '1px solid var(--mneme-border)', borderRadius: '6px',
                backgroundColor: isListening ? 'var(--mneme-accent-soft)' : 'var(--mneme-surface)',
                cursor: SpeechRecognition ? 'pointer' : 'not-allowed',
                opacity: SpeechRecognition ? 1 : 0.65, fontSize: '1.1rem',
              }}
            >
              {isListening ? '●' : '🎤'}
            </button>
          </div>
          {!SpeechRecognition && (
            <div style={{ marginTop: '0.5rem', color: 'var(--mneme-muted)', fontSize: '0.9rem' }}>Tap microphone, speak your task</div>
          )}
        </div>

        <div style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Mode</label>
            <select value={formData.mode} onChange={(e) => setField('mode', e.target.value)} style={inputStyle}>
              <option value="interactive">Interactive</option>
              <option value="autonomous">Autonomous</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Risk Level</label>
            <select value={formData.risk_level} onChange={(e) => setField('risk_level', e.target.value)} style={inputStyle}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              Model Provider <span style={{ color: 'var(--mneme-muted)', fontSize: '0.85rem' }}>(optional)</span>
            </label>
            <select value={formData.model_provider} onChange={(e) => setField('model_provider', e.target.value)} style={inputStyle}>
              <option value="">Project default</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              Model Name <span style={{ color: 'var(--mneme-muted)', fontSize: '0.85rem' }}>(optional)</span>
            </label>
            <input
              type="text"
              value={formData.model_name}
              onChange={(e) => setField('model_name', e.target.value)}
              placeholder={
                formData.model_provider === 'anthropic' ? 'e.g. claude-opus-4-5'
                : formData.model_provider === 'openai' ? 'e.g. gpt-4o'
                : formData.model_provider === 'google' ? 'e.g. gemini-2.5-pro'
                : formData.model_provider === 'ollama' ? 'e.g. llama3.1'
                : 'Leave blank for project default'
              }
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit" disabled={isSubmitting} className="mneme-btn mneme-btn-primary">
            {isSubmitting ? 'Creating...' : 'Create Task'}
          </button>
          <button type="button" onClick={onCancel} className="mneme-btn mneme-btn-ghost">
            Cancel
          </button>
        </div>

      </form>
    </div>
  )
}
