import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LayerProvider } from './context/LayerContext'
import Login from './pages/Login'
import ModernApp from './ModernApp'
import Home from './pages/Home'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import TaskDetail from './pages/TaskDetail'
import Approvals from './pages/Approvals'
import Settings from './pages/Settings'
import SetupWizard from './pages/SetupWizard'
import Audit from './pages/Audit'
import GlobalErrorBoundary from './components/GlobalErrorBoundary'

function RequireAuth({ children }) {
  const { isAuthenticated, token } = useAuth()

  if (!isAuthenticated || !token) {
    return <Login />
  }

  return children
}

export default function App() {
  return (
    <AuthProvider>
      <LayerProvider>
        <GlobalErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<RequireAuth><ModernApp /></RequireAuth>} />
              <Route path="/overview" element={<RequireAuth><ModernApp /></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><Home /></RequireAuth>} />
              <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
              <Route path="/project/:projectId" element={<RequireAuth><ProjectDetail /></RequireAuth>} />
              <Route path="/task/:taskId" element={<RequireAuth><TaskDetail /></RequireAuth>} />
              <Route path="/approvals" element={<RequireAuth><Approvals /></RequireAuth>} />
              <Route path="/workers" element={<RequireAuth><Home /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
              <Route path="/setup" element={<RequireAuth><SetupWizard /></RequireAuth>} />
              <Route path="/audit" element={<RequireAuth><Audit /></RequireAuth>} />
              <Route path="*" element={<RequireAuth><ModernApp /></RequireAuth>} />
            </Routes>
          </BrowserRouter>
        </GlobalErrorBoundary>
      </LayerProvider>
    </AuthProvider>
  )
}
