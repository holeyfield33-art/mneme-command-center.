import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LayerProvider } from './context/LayerContext'
import Login from './pages/Login'
import ModernApp from './ModernApp'
import GlobalErrorBoundary from './components/GlobalErrorBoundary'

function AppLayout() {
  const { isAuthenticated, token } = useAuth()

  if (!isAuthenticated || !token) {
    return <Login />
  }

  return <ModernApp />
}

export default function App() {
  return (
    <AuthProvider>
      <LayerProvider>
        <GlobalErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/*" element={<AppLayout />} />
            </Routes>
          </BrowserRouter>
        </GlobalErrorBoundary>
      </LayerProvider>
    </AuthProvider>
  )
}
