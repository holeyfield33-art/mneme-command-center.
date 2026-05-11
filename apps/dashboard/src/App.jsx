import React from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LayerProvider } from './context/LayerContext'
import Login from './pages/Login'
import Home from './pages/Home'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import TaskDetail from './pages/TaskDetail'
import Approvals from './pages/Approvals'
import useSSE from './useSSE'
import Settings from './pages/Settings'
import SetupWizard from './pages/SetupWizard'
import ApprovalHub from './components/ApprovalHub'
import ActivityFeed from './components/ActivityFeed'
import WorkflowCanvas from './components/WorkflowCanvas'
import ControlRoom from './components/ControlRoom'
import GlobalErrorBoundary from './components/GlobalErrorBoundary'

function ReauthModal() {
  const { reauth, completeReauth, cancelReauth } = useAuth()
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (reauth.required) {
      setPassword('')
      setError('')
      setLoading(false)
    }
  }, [reauth.required])

  if (!reauth.required) {
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await completeReauth(password)
      setPassword('')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Identity confirmation failed. Check password and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1700,
        padding: '1rem',
      }}
    >
      <div className="mneme-surface mneme-enter" style={{ width: 'min(520px, 100%)', padding: '1rem 1.1rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.4rem' }}>Reauthenticate To Continue</h3>
        <p style={{ marginTop: 0, color: '#526170', fontSize: '0.92rem' }}>
          This approval action requires identity confirmation before continuing.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.65rem' }}>
          <label htmlFor="reauth-password" style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            Admin Password
          </label>
          <input
            id="reauth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            required
            disabled={loading}
            style={{
              padding: '0.55rem 0.7rem',
              borderRadius: '6px',
              border: '1px solid #c9d4de',
              fontSize: '0.95rem',
            }}
          />
          {error && <div className="mneme-alert error" style={{ margin: 0 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.55rem' }}>
            <button
              type="button"
              onClick={cancelReauth}
              disabled={loading}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid #c9d4de',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2f9e6f',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {loading ? 'Confirming...' : 'Confirm Identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Layout({ children }) {
  const navigate = useNavigate()
  const { isAuthenticated, logout } = useAuth()
  const { isConnected } = useSSE()

  if (!isAuthenticated) {
    return children
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', paddingBottom: '24rem' }}>
      <nav style={{
        backgroundColor: '#2c3e50',
        color: 'white',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <Link to="/" style={{ color: 'white', textDecoration: 'none', fontSize: '1.2rem', fontWeight: 'bold' }}>
            🚀 Mneme
          </Link>
          <Link to="/projects" style={{ color: 'white', textDecoration: 'none' }}>
            Projects
          </Link>
          <Link to="/approvals" style={{ color: 'white', textDecoration: 'none' }}>
            Approvals
          </Link>
          <Link to="/settings" style={{ color: 'white', textDecoration: 'none' }}>
            ⚙️ Settings
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
            <span
              style={{
                width: '0.65rem',
                height: '0.65rem',
                borderRadius: '999px',
                display: 'inline-block',
                backgroundColor: isConnected ? '#2ecc71' : '#ff4d4f'
              }}
            />
            Live {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <button
          onClick={() => {
            logout()
            navigate('/login')
          }}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </nav>
      {children}
      {/* Layer 0: Always-visible Approval Hub */}
      <ApprovalHub />
      {/* Layer 1: Activity Feed */}
      <ActivityFeed />
      {/* Layer 2: Workflow Canvas Modal */}
      <WorkflowCanvas />
      {/* Layer 3: Control Room Modal */}
      <ControlRoom />
      <ReauthModal />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
    }
  }, [isAuthenticated, navigate])

  return isAuthenticated ? children : null
}

export default function App() {
  return (
    <AuthProvider>
      <LayerProvider>
        <GlobalErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <Layout>
                    <ProtectedRoute>
                      <Home />
                    </ProtectedRoute>
                  </Layout>
                }
              />
              <Route
                path="/projects"
                element={
                  <Layout>
                    <ProtectedRoute>
                      <Projects />
                    </ProtectedRoute>
                  </Layout>
                }
              />
              <Route
                path="/project/:projectId"
                element={
                  <Layout>
                    <ProtectedRoute>
                      <ProjectDetail />
                    </ProtectedRoute>
                  </Layout>
                }
              />
              <Route
                path="/task/:taskId"
                element={
                  <Layout>
                    <ProtectedRoute>
                      <TaskDetail />
                    </ProtectedRoute>
                  </Layout>
                }
              />
              <Route
                path="/approvals"
                element={
                  <Layout>
                    <ProtectedRoute>
                      <Approvals />
                    </ProtectedRoute>
                  </Layout>
                }
              />
              <Route
                path="/settings"
                element={
                  <Layout>
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  </Layout>
                }
              />
              <Route
                path="/setup"
                element={
                  <Layout>
                    <ProtectedRoute>
                      <SetupWizard />
                    </ProtectedRoute>
                  </Layout>
                }
              />
            </Routes>
          </BrowserRouter>
        </GlobalErrorBoundary>
      </LayerProvider>
    </AuthProvider>
  )
}
