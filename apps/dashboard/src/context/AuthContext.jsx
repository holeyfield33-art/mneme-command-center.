import React, { createContext, useState, useContext, useEffect } from 'react'
import { auth } from '../api'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [isAuthenticated, setIsAuthenticated] = useState(!!token)
  const [reauth, setReauth] = useState({ required: false, onComplete: null })

  const login = (newToken) => {
    setToken(newToken)
    setIsAuthenticated(true)
    localStorage.setItem('token', newToken)
  }

  const logout = () => {
    setToken(null)
    setIsAuthenticated(false)
    localStorage.removeItem('token')
  }

  const triggerReauth = (onComplete = null) => {
    setReauth({
      required: true,
      onComplete: typeof onComplete === 'function' ? onComplete : null,
    })
  }

  const cancelReauth = () => {
    setReauth({ required: false, onComplete: null })
  }

  const completeReauth = async (password) => {
    const callback = reauth.onComplete
    const response = await auth.login(password)
    const newToken = response?.data?.access_token

    if (!newToken) {
      throw new Error('reauth_login_failed')
    }

    login(newToken)
    setReauth({ required: false, onComplete: null })

    if (callback) {
      await callback()
    }
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated,
        login,
        logout,
        reauth,
        triggerReauth,
        cancelReauth,
        completeReauth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
