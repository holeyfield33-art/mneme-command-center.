import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [password, setPassword] = useState('')
  const [googleIdToken, setGoogleIdToken] = useState('')
  const [deviceCode, setDeviceCode] = useState('')
  const [oneTimeToken, setOneTimeToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { loginWithPassword, loginWithGoogle, loginWithMobileExchange } = useAuth()

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await loginWithPassword(password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid password')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await loginWithGoogle(googleIdToken)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Google authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleMobileSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await loginWithMobileExchange(deviceCode, oneTimeToken)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Mobile exchange failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '520px'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Mneme Command Center</h1>
        <form onSubmit={handlePasswordSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="login-password" style={{ display: 'block', marginBottom: '0.5rem' }}>Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
          {error && <div style={{ color: 'red', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div style={{ margin: '1rem 0', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
          <form onSubmit={handleGoogleSubmit}>
            <label htmlFor="google-id-token" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Google ID Token
            </label>
            <input
              id="google-id-token"
              type="text"
              value={googleIdToken}
              onChange={(e) => setGoogleIdToken(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
                marginBottom: '0.5rem'
              }}
            />
            <button
              type="submit"
              disabled={loading || !googleIdToken.trim()}
              style={{
                width: '100%',
                padding: '0.6rem',
                backgroundColor: '#1a73e8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                opacity: loading || !googleIdToken.trim() ? 0.5 : 1
              }}
            >
              Continue with Google Token
            </button>
          </form>
        </div>

        <div style={{ borderTop: '1px solid #eee', paddingTop: '1rem' }}>
          <form onSubmit={handleMobileSubmit}>
            <label htmlFor="mobile-device-code" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Mobile Device Code
            </label>
            <input
              id="mobile-device-code"
              type="text"
              value={deviceCode}
              onChange={(e) => setDeviceCode(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
                marginBottom: '0.5rem'
              }}
            />
            <label htmlFor="mobile-one-time-token" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Mobile One-Time Token
            </label>
            <input
              id="mobile-one-time-token"
              type="password"
              value={oneTimeToken}
              onChange={(e) => setOneTimeToken(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
                marginBottom: '0.5rem'
              }}
            />
            <button
              type="submit"
              disabled={loading || !deviceCode.trim() || !oneTimeToken.trim()}
              style={{
                width: '100%',
                padding: '0.6rem',
                backgroundColor: '#5f6368',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                opacity: loading || !deviceCode.trim() || !oneTimeToken.trim() ? 0.5 : 1
              }}
            >
              Exchange Mobile Token
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
