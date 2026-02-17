'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'

interface ChatContextType {
  isOpen: boolean
  conversationId: string | null
  open: () => void
  close: () => void
  toggle: () => void
  setConversationId: (id: string | null) => void
  startNewConversation: () => void
}

const ChatContext = createContext<ChatContextType>({
  isOpen: false,
  conversationId: null,
  open: () => {},
  close: () => {},
  toggle: () => {},
  setConversationId: () => {},
  startNewConversation: () => {},
})

export function useChatPane() {
  return useContext(ChatContext)
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])
  const startNewConversation = useCallback(() => setConversationId(null), [])

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
    <ChatContext.Provider value={{ isOpen, conversationId, open, close, toggle, setConversationId, startNewConversation }}>
      {children}
    </ChatContext.Provider>
  )
}
