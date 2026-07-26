"use client"
/**
 * DiscordContext.jsx
 * Manages the public player Discord OAuth session.
 * Token is stored in sessionStorage under 'discord_token'.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'

const DiscordContext = createContext({
  player:        null,   // { discord_id, username, avatar, whitelist }
  loading:       true,
  login:         () => {},   // redirect to Discord OAuth
  logout:        () => {},
  saveToken:     (_token) => {},
  refreshPlayer: async () => {},
})

export function DiscordProvider({ children }) {
  const [player,  setPlayer]  = useState(null)
  const [loading, setLoading] = useState(true)

  const getToken = () =>
    (typeof window !== 'undefined' ? sessionStorage.getItem('discord_token') : null)

  const hydrate = useCallback(async () => {
    const token = getToken()
    if (!token) { setPlayer(null); setLoading(false); return }
    try {
      const { data } = await api.get('/discord/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      setPlayer(data)
    } catch {
      sessionStorage.removeItem('discord_token')
      setPlayer(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { hydrate() }, [hydrate])

  // Listen for token saved from the /auth/discord callback page
  useEffect(() => {
    const handler = () => hydrate()
    window.addEventListener('discord-login', handler)
    return () => window.removeEventListener('discord-login', handler)
  }, [hydrate])

  const login = (redirectTo = '/whitelist') => {
    const dest = encodeURIComponent(redirectTo)
    window.location.href = `/api/discord/login?redirect=${dest}`
  }

  const logout = () => {
    sessionStorage.removeItem('discord_token')
    setPlayer(null)
    window.dispatchEvent(new Event('discord-logout'))
  }

  const saveToken = (token) => {
    sessionStorage.setItem('discord_token', token)
    window.dispatchEvent(new Event('discord-login'))
  }

  const refreshPlayer = async () => {
    await hydrate()
  }

  return (
    <DiscordContext.Provider value={{ player, loading, login, logout, saveToken, refreshPlayer }}>
      {children}
    </DiscordContext.Provider>
  )
}

export function useDiscord() {
  return useContext(DiscordContext)
}
