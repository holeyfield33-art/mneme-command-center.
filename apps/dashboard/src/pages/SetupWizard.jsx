import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { system, projects } from '../api'

const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama']

const cardStyle = {
  background: 'white', borderRadius: 8, padding: '2rem',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: 520, margin: '0 auto',
}
const inputStyle = {
  width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #ccc',
  borderRadius: 4, fontSize: 15, boxSizing: 'border-box', marginBottom: '1rem',
}
const btnStyle = (bg = '#2c3e50') => ({
  width: '100%', padding: '0.7rem', background: bg, color: 'white',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 15, marginTop: 8,
})
const stepLabel = { fontWeight: 700, fontSize: 13, color: '#888', marginBottom: 4 }
const stepTitle = { fontSize: 20, fontWeight: 700, marginBottom: '1.25rem', marginTop: 0 }

const TOTAL_STEPS = 4

export default function SetupWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: password (already logged in via login page, so this is informational)
  // Step 2: Provider
  const [provider, setProvider] = useState('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  // Step 3: GitHub
  const [githubToken, setGithubToken] = useState('')
  // Step 4: First repo
  const [repoUrl, setRepoUrl] = useState('')
  const [repoName, setRepoName] = useState('')

  const stepHeader = `Step ${step} of ${TOTAL_STEPS}`

  const next = () => { setError(''); setStep(s => s + 1) }

  const saveProviderSettings = async () => {
    setLoading(true)
    setError('')
    try {
      const payload = { MODEL_PROVIDER: provider }
      if (provider === 'anthropic') { payload.ANTHROPIC_API_KEY = apiKey; if (model) payload.ANTHROPIC_MODEL = model }
      if (provider === 'openai') { payload.OPENAI_API_KEY = apiKey; if (model) payload.OPENAI_MODEL = model }
      if (provider === 'google') { payload.GOOGLE_API_KEY = apiKey; if (model) payload.GOOGLE_MODEL = model }
      if (provider === 'ollama') { payload.OLLAMA_BASE_URL = ollamaUrl; if (model) payload.OLLAMA_MODEL = model }
      await system.updateSettings(payload)
      next()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save settings.')
    } finally {
      setLoading(false)
    }
  }

  const saveGitHub = async () => {
    setLoading(true)
    setError('')
    try {
      if (githubToken) await system.updateSettings({ GITHUB_TOKEN: githubToken })
      next()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save GitHub token.')
    } finally {
      setLoading(false)
    }
  }

  const connectRepo = async () => {
    if (!repoUrl) { next(); return }
    setLoading(true)
    setError('')
    try {
      await projects.connectGithub({ repo_url: repoUrl, name: repoName || undefined })
      next()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to connect repo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: 32 }}>🚀</span>
          <h2 style={{ margin: '0.5rem 0 0' }}>Welcome to Mneme</h2>
          <p style={{ color: '#888', margin: '0.25rem 0 0', fontSize: 14 }}>Let's set up your AI coding command center.</p>
        </div>

        {/* Progress bar */}
        <div style={{ background: '#eee', borderRadius: 4, height: 6, marginBottom: '1.75rem' }}>
          <div style={{ background: '#2c3e50', borderRadius: 4, height: 6, width: `${(step / TOTAL_STEPS) * 100}%`, transition: 'width 0.3s' }} />
        </div>

        {error && <p style={{ color: 'red', marginBottom: '1rem', fontSize: 14 }}>{error}</p>}

        {step === 1 && (
          <>
            <p style={stepLabel}>{stepHeader}</p>
            <p style={stepTitle}>Choose your AI provider</p>
            <p style={{ fontSize: 14, color: '#555', marginBottom: '1rem' }}>
              Select which AI model will power your coding agent. You can change this anytime in Settings.
            </p>
            <div style={{ display: 'grid', gap: 8, marginBottom: '1.5rem' }}>
              {PROVIDERS.map(p => (
                <label key={p} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem', border: `2px solid ${provider === p ? '#2c3e50' : '#ddd'}`,
                  borderRadius: 6, cursor: 'pointer', fontWeight: provider === p ? 700 : 400,
                }}>
                  <input type="radio" name="provider" value={p} checked={provider === p} onChange={() => { setProvider(p); setApiKey(''); setModel('') }} />
                  {p === 'anthropic' && '🧠 Anthropic (Claude) — best for coding'}
                  {p === 'openai' && '⚡ OpenAI (GPT-4o) — versatile'}
                  {p === 'google' && '✨ Google (Gemini) — large context'}
                  {p === 'ollama' && '🖥️ Ollama — free & local, no API key needed'}
                </label>
              ))}
            </div>
            <button onClick={next} style={btnStyle()}>Continue →</button>
          </>
        )}

        {step === 2 && (
          <>
            <p style={stepLabel}>{stepHeader}</p>
            <p style={stepTitle}>Configure {provider.charAt(0).toUpperCase() + provider.slice(1)}</p>
            {provider !== 'ollama' ? (
              <>
                <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 }}>API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={provider === 'anthropic' ? 'sk-ant-...' : provider === 'openai' ? 'sk-...' : 'AIza...'} style={inputStyle} />
                <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 }}>Model (optional — uses default if blank)</label>
                <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="Leave blank for default" style={inputStyle} />
              </>
            ) : (
              <>
                <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 }}>Ollama URL</label>
                <input type="text" value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} style={inputStyle} />
                <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 }}>Model</label>
                <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. llama3.1 or qwen2.5-coder" style={inputStyle} />
                <p style={{ fontSize: 12, color: '#666' }}>Make sure Ollama is running: <code>ollama serve</code></p>
              </>
            )}
            <button onClick={saveProviderSettings} disabled={loading} style={btnStyle('#27ae60')}>
              {loading ? 'Saving…' : 'Save & Continue →'}
            </button>
            <button onClick={next} style={{ ...btnStyle('#888'), marginTop: 6 }}>Skip</button>
          </>
        )}

        {step === 3 && (
          <>
            <p style={stepLabel}>{stepHeader}</p>
            <p style={stepTitle}>GitHub Integration (optional)</p>
            <p style={{ fontSize: 14, color: '#555', marginBottom: '1rem' }}>
              Add a GitHub Personal Access Token to connect repos by URL and auto-create pull requests.
            </p>
            <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 }}>GitHub PAT</label>
            <input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="ghp_..." style={inputStyle} />
            <p style={{ fontSize: 12, color: '#666', marginBottom: '1rem' }}>
              Create one at <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">github.com/settings/tokens</a> with <code>repo</code> scope.
            </p>
            <button onClick={saveGitHub} disabled={loading} style={btnStyle('#27ae60')}>
              {loading ? 'Saving…' : 'Save & Continue →'}
            </button>
            <button onClick={next} style={{ ...btnStyle('#888'), marginTop: 6 }}>Skip</button>
          </>
        )}

        {step === 4 && (
          <>
            <p style={stepLabel}>{stepHeader}</p>
            <p style={stepTitle}>Connect your first repo</p>
            <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 }}>GitHub Repo URL</label>
            <input type="text" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" style={inputStyle} />
            <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 4 }}>Project name (optional)</label>
            <input type="text" value={repoName} onChange={e => setRepoName(e.target.value)} placeholder="My Project" style={inputStyle} />
            <button onClick={connectRepo} disabled={loading} style={btnStyle('#27ae60')}>
              {loading ? 'Connecting…' : 'Connect & Finish 🎉'}
            </button>
            <button onClick={() => navigate('/')} style={{ ...btnStyle('#888'), marginTop: 6 }}>Skip — go to dashboard</button>
          </>
        )}

        {step > TOTAL_STEPS && (
          <>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 40 }}>🎉</p>
              <p style={stepTitle}>All set!</p>
              <p style={{ fontSize: 14, color: '#555' }}>Your Mneme is ready. Create a project, submit a task, and let your AI lead engineer take it from there.</p>
              <button onClick={() => navigate('/')} style={btnStyle('#27ae60')}>Go to Dashboard →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
