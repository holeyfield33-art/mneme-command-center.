import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { system } from '../api'

const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama']
const PROVIDER_MODELS = {
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-20241022'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3', 'o4-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  ollama: ['llama3.1', 'llama3.2', 'qwen2.5-coder', 'codestral', 'mistral', 'deepseek-r1'],
}

const sectionStyle = {
  background: 'white',
  borderRadius: 8,
  padding: '1.5rem',
  marginBottom: '1.5rem',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
}

const labelStyle = { display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }
const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #ccc',
  borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
}
const btnStyle = (color = '#2c3e50') => ({
  padding: '0.5rem 1.25rem', background: color, color: 'white',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14,
})

function Field({ label, name, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({
    MODEL_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: '',
    OPENAI_API_KEY: '',
    OPENAI_MODEL: '',
    GOOGLE_API_KEY: '',
    GOOGLE_MODEL: '',
    OLLAMA_BASE_URL: '',
    OLLAMA_MODEL: '',
    GITHUB_TOKEN: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    PUBLIC_DASHBOARD_URL: '',
    NOTIFICATIONS_ENABLED: 'false',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loadingStatus, setLoadingStatus] = useState(false)

  const loadRuntimeStatus = async () => {
    setLoadingStatus(true)
    try {
      const r = await system.getRuntimeStatus()
      setStatus(r.data)
      const d = r.data
      setForm(f => ({
        ...f,
        MODEL_PROVIDER: d.model_provider || 'anthropic',
        ANTHROPIC_MODEL: d.available_providers?.anthropic?.model || '',
        OPENAI_MODEL: d.available_providers?.openai?.model || '',
        GOOGLE_MODEL: d.available_providers?.google?.model || '',
        OLLAMA_BASE_URL: d.available_providers?.ollama?.url || '',
        OLLAMA_MODEL: d.available_providers?.ollama?.model || '',
        NOTIFICATIONS_ENABLED: d.notifications_enabled ? 'true' : 'false',
      }))
    } catch (_err) {
      // Keep existing values on transient load failures.
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    loadRuntimeStatus()
  }, [])

  const handleChange = e => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      // Only send non-empty values so we don't overwrite keys we haven't loaded
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      await system.updateSettings(payload)
      await loadRuntimeStatus()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const provider = form.MODEL_PROVIDER
  const providerHealth = status?.available_providers?.[provider]?.health

  const setRecommendedModel = () => {
    const recommended = {
      anthropic: 'claude-sonnet-4-5',
      openai: 'gpt-4o',
      google: 'gemini-2.5-flash',
      ollama: 'qwen2.5-coder',
    }[provider]
    if (!recommended) return

    if (provider === 'anthropic') setForm(f => ({ ...f, ANTHROPIC_MODEL: recommended }))
    if (provider === 'openai') setForm(f => ({ ...f, OPENAI_MODEL: recommended }))
    if (provider === 'google') setForm(f => ({ ...f, GOOGLE_MODEL: recommended }))
    if (provider === 'ollama') setForm(f => ({ ...f, OLLAMA_MODEL: recommended }))
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>⚙️ Settings</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={loadRuntimeStatus} disabled={loadingStatus} style={btnStyle('#0d6efd')}>
            {loadingStatus ? 'Refreshing…' : 'Refresh Health'}
          </button>
          <button onClick={() => navigate('/setup')} style={btnStyle('#6c757d')}>
            Open Setup Wizard
          </button>
        </div>
      </div>
      <p style={{ marginTop: 0, color: '#666', marginBottom: '1.5rem' }}>
        Configure providers, GitHub access, and notifications. These settings apply globally.
      </p>

      {/* AI Provider */}
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>AI Provider</h3>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Active Provider</label>
          <select name="MODEL_PROVIDER" value={form.MODEL_PROVIDER} onChange={handleChange} style={inputStyle}>
            {PROVIDERS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={setRecommendedModel} style={btnStyle('#6f42c1')}>
            Use Recommended Model
          </button>
          <span style={{ fontSize: 12, color: '#666' }}>
            Provider health: {providerHealth?.status || 'unknown'}{providerHealth?.error ? ` (${providerHealth.error})` : ''}
          </span>
        </div>

        {provider === 'anthropic' && (
          <>
            <Field label="Anthropic API Key" name="ANTHROPIC_API_KEY" value={form.ANTHROPIC_API_KEY} onChange={handleChange} type="password" placeholder="sk-ant-..." />
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Anthropic Model</label>
              <select name="ANTHROPIC_MODEL" value={form.ANTHROPIC_MODEL} onChange={handleChange} style={inputStyle}>
                {PROVIDER_MODELS.anthropic.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
              Status: {status?.available_providers?.anthropic?.configured ? '✅ Key configured' : '❌ No key set'}
            </p>
            <p style={{ fontSize: 12, color: '#666', margin: '0.35rem 0 0' }}>
              Health: {status?.available_providers?.anthropic?.health?.status || 'unknown'}
              {status?.available_providers?.anthropic?.health?.error ? ` (${status.available_providers.anthropic.health.error})` : ''}
            </p>
          </>
        )}

        {provider === 'openai' && (
          <>
            <Field label="OpenAI API Key" name="OPENAI_API_KEY" value={form.OPENAI_API_KEY} onChange={handleChange} type="password" placeholder="sk-..." />
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>OpenAI Model</label>
              <select name="OPENAI_MODEL" value={form.OPENAI_MODEL} onChange={handleChange} style={inputStyle}>
                {PROVIDER_MODELS.openai.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
              Status: {status?.available_providers?.openai?.configured ? '✅ Key configured' : '❌ No key set'}
            </p>
            <p style={{ fontSize: 12, color: '#666', margin: '0.35rem 0 0' }}>
              Health: {status?.available_providers?.openai?.health?.status || 'unknown'}
              {status?.available_providers?.openai?.health?.error ? ` (${status.available_providers.openai.health.error})` : ''}
            </p>
          </>
        )}

        {provider === 'google' && (
          <>
            <Field label="Google API Key" name="GOOGLE_API_KEY" value={form.GOOGLE_API_KEY} onChange={handleChange} type="password" placeholder="AIza..." />
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Google Model</label>
              <select name="GOOGLE_MODEL" value={form.GOOGLE_MODEL} onChange={handleChange} style={inputStyle}>
                {PROVIDER_MODELS.google.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
              Status: {status?.available_providers?.google?.configured ? '✅ Key configured' : '❌ No key set'}
            </p>
            <p style={{ fontSize: 12, color: '#666', margin: '0.35rem 0 0' }}>
              Health: {status?.available_providers?.google?.health?.status || 'unknown'}
              {status?.available_providers?.google?.health?.error ? ` (${status.available_providers.google.health.error})` : ''}
            </p>
          </>
        )}

        {provider === 'ollama' && (
          <>
            <Field label="Ollama Base URL" name="OLLAMA_BASE_URL" value={form.OLLAMA_BASE_URL} onChange={handleChange} placeholder="http://localhost:11434" />
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Ollama Model</label>
              <select name="OLLAMA_MODEL" value={form.OLLAMA_MODEL} onChange={handleChange} style={inputStyle}>
                {PROVIDER_MODELS.ollama.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 12, color: '#666', margin: 0 }}>Free &amp; local — requires Ollama running on this machine.</p>
            <p style={{ fontSize: 12, color: '#666', margin: '0.35rem 0 0' }}>
              Health: {status?.available_providers?.ollama?.health?.status || 'unknown'}
              {status?.available_providers?.ollama?.health?.error ? ` (${status.available_providers.ollama.health.error})` : ''}
            </p>
          </>
        )}
      </div>

      {/* GitHub */}
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>GitHub Integration</h3>
        <Field label="GitHub Personal Access Token (PAT)" name="GITHUB_TOKEN" value={form.GITHUB_TOKEN} onChange={handleChange} type="password" placeholder="ghp_..." />
        <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
          Required to connect repos by URL and auto-create pull requests after approved diffs.
          Status: {status?.github_configured ? '✅ Token configured' : '❌ Not set'}
        </p>
      </div>

      {/* Notifications */}
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>Notifications (Telegram)</h3>
        <Field label="Telegram Bot Token" name="TELEGRAM_BOT_TOKEN" value={form.TELEGRAM_BOT_TOKEN} onChange={handleChange} type="password" />
        <Field label="Telegram Chat ID" name="TELEGRAM_CHAT_ID" value={form.TELEGRAM_CHAT_ID} onChange={handleChange} />
        <Field label="Public Dashboard URL (for notification links)" name="PUBLIC_DASHBOARD_URL" value={form.PUBLIC_DASHBOARD_URL} onChange={handleChange} placeholder="https://your-dashboard.example.com" />
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Enable Notifications</label>
          <select name="NOTIFICATIONS_ENABLED" value={form.NOTIFICATIONS_ENABLED} onChange={handleChange} style={inputStyle}>
            <option value="false">Disabled</option>
            <option value="true">Enabled</option>
          </select>
        </div>
      </div>

      {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}
      {saved && <p style={{ color: 'green', marginBottom: '1rem' }}>✅ Settings saved.</p>}

      <button onClick={handleSave} disabled={saving} style={btnStyle('#27ae60')}>
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
      <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
        Settings are written to <code>.env</code> at the workspace root and applied immediately. A full restart picks up all changes.
      </p>
    </div>
  )
}
