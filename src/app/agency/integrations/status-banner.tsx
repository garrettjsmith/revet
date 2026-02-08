'use client'

import { useSearchParams } from 'next/navigation'

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Google authorization was cancelled. Click "Connect Google" to try again.',
  invalid_state: 'Authorization session expired. Please try connecting again.',
  no_code: 'Authorization failed — no authorization code received.',
  token_exchange_failed: 'Failed to complete Google authorization. Please try again.',
  save_failed: 'Connected to Google but failed to save tokens. Please try again.',
}

export function IntegrationStatusBanner() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const detail = searchParams.get('detail')
  const connected = searchParams.get('connected')

  if (connected === 'google') {
    return (
      <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-6">
        Google account connected successfully.
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
        <p>{ERROR_MESSAGES[error] || `Authorization error: ${error}`}</p>
        {detail && (
          <p className="text-xs text-amber-600 mt-1 font-mono">{detail}</p>
        )}
      </div>
    )
  }

  return null
}
