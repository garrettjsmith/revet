'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'

interface ChatContextType {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const ChatContext = createContext<ChatContextType>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
})

export function useChatPane() {
  return useContext(ChatContext)
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  // Cmd+J / Ctrl+J keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  return (
    <ChatContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </ChatContext.Provider>
  )
}
