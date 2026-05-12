import React, { createContext, useState, useContext, useEffect } from 'react'
import { auth, api } from '../api'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [reauth, setReauth] = useState({ required: false, onComplete: null })

  // Validate persisted token on boot — clear it if the API rejects it.
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) return
    api.get('/system/runtime-status').then(() => {
      setIsAuthenticated(true)
    }).catch(() => {
      localStorage.removeItem('token')
      setToken(null)
      setIsAuthenticated(false)
    })
  }, [])

  const login = (newToken) => {
    setToken(newToken)
    setIsAuthenticated(true)
    localStorage.setItem('token', newToken)
  }

  const _loginFromResponse = (response, errorCode) => {
    const newToken = response?.data?.access_token
    if (!newToken) {
      throw new Error(errorCode)
    }
    login(newToken)
    return newToken
  }

  const loginWithPassword = async (password) => {
    const response = await auth.login(password)
    return _loginFromResponse(response, 'password_login_failed')
  }

  const loginWithGoogle = async (idToken) => {
    const response = await auth.googleLogin(idToken)
    return _loginFromResponse(response, 'google_login_failed')
  }

  const loginWithMobileExchange = async (deviceCode, oneTimeToken) => {
    const response = await auth.mobileExchange(deviceCode, oneTimeToken)
    return _loginFromResponse(response, 'mobile_exchange_failed')
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
    await loginWithPassword(password)
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
        loginWithPassword,
        loginWithGoogle,
        loginWithMobileExchange,
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
