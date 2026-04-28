import React from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Home from './pages/Home'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import TaskDetail from './pages/TaskDetail'
import Approvals from './pages/Approvals'

function Layout({ children }) {
  const navigate = useNavigate()
  const { isAuthenticated, logout } = useAuth()

  if (!isAuthenticated) {
    return children
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
