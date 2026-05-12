import React from 'react'
import { useAuth } from './context/AuthContext'
import useSSE from './useSSE'
import ModernLayout from './components/Modern/ModernLayout'
import { useMnemeState } from './components/Modern/useMnemeState'

export default function ModernApp() {
  const { token, logout } = useAuth()
  const [layout, setLayout] = React.useState('top')
  const [accent, setAccent] = React.useState('amber')

  if (!token) {
    return null
  }

  return (
    <ModernLayout
      layout={layout}
      accent={accent}
      onLayoutChange={setLayout}
      onAccentChange={setAccent}
      onLogout={logout}
    />
  )
}
