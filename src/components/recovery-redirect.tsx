'use client'

import { useEffect } from 'react'

export function RecoveryRedirect() {
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      // Redirect to reset password page, preserving the hash fragment
      window.location.href = '/admin/reset-password' + hash
    }
  }, [])

  return null
}
