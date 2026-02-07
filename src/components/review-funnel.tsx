'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ReviewProfile } from '@/lib/types'

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

async function trackEvent(
  profileId: string,
  eventType: string,
  sessionId: string,
  data?: { rating?: number; routed_to?: string }
) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: profileId,
        event_type: eventType,
        session_id: sessionId,
        ...data,
      }),
    })
  } catch {
    // Non-blocking — don't break UX if tracking fails
  }
}

export function ReviewFunnel({ profile }: { profile: ReviewProfile }) {
  const [step, setStep] = useState<'ask' | 'positive' | 'negative'>('ask')
  const [hoverStar, setHoverStar] = useState(0)
  const [selectedRating, setSelectedRating] = useState(0)
  const [feedbackText, setFeedbackText] = useState('')
  const [sessionId] = useState(generateSessionId)

  const reviewUrl = `https://search.google.com/local/writereview?placeid=${profile.place_id}`

  // Track page view on mount
  useEffect(() => {
    trackEvent(profile.id, 'page_view', sessionId)
  }, [profile.id, sessionId])

  const handleStarClick = useCallback((rating: number) => {
    setSelectedRating(rating)
    trackEvent(profile.id, 'rating_submitted', sessionId, { rating })

    const routed = rating >= profile.positive_threshold ? 'google' : 'email'

    setTimeout(() => {
      setStep(routed === 'google' ? 'positive' : 'negative')
    }, 400)
  }, [profile.id, profile.positive_threshold, sessionId])

  const handleGoogleClick = () => {
    trackEvent(profile.id, 'google_click', sessionId, { routed_to: 'google' })
  }

  const handleEmailClick = () => {
    trackEvent(profile.id, 'email_click', sessionId, { routed_to: 'email' })
  }

  const primary = profile.primary_color

  return (
    <div className="min-h-screen bg-cream relative">
      {/* Blueprint grid overlay */}
      <div className="absolute inset-0 blueprint-grid pointer-events-none" />

      {/* Top accent bar */}
      <div className="h-1 bg-ink relative z-10" />

      <div className="max-w-[480px] mx-auto px-6 pt-16 pb-20 text-center relative z-10">

        {/* Logo */}
        <div className="mb-12">
          {profile.logo_url ? (
            <img
              src={profile.logo_url}
              alt={profile.name}
              className="h-16 mx-auto object-contain"
            />
          ) : (
            <div
              className="inline-flex flex-col items-center px-8 py-4 rounded-xl text-cream"
              style={{ background: primary }}
            >
              <div className="text-xl font-bold tracking-[0.15em] leading-tight">
                {profile.logo_text || profile.name?.split('–')?.[0]?.trim() || 'LOGO'}
              </div>
              {profile.logo_subtext && (
                <div className="text-xs font-medium tracking-[0.25em] opacity-85 mt-0.5">
                  {profile.logo_subtext}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Step: Ask ── */}
        {step === 'ask' && (
          <div className="animate-[fadeUp_0.5s_ease]">
            <h1 className="text-3xl font-serif text-ink mb-3 leading-snug text-balance">
              {profile.heading}
            </h1>
            <p className="text-base text-warm-gray mb-10 leading-relaxed">
              {profile.subtext}
            </p>

            <p className="text-sm font-medium text-ink mb-5">
              How was your experience?
            </p>

            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHoverStar(star)}
                  onMouseLeave={() => setHoverStar(0)}
                  onClick={() => handleStarClick(star)}
                  className="p-1 transition-transform duration-150"
                  style={{
                    color: (hoverStar >= star || selectedRating >= star) ? '#FBBF24' : '#D5CFC5',
                    transform: hoverStar === star ? 'scale(1.2)' : 'scale(1)',
                  }}
                >
                  <svg width="44" height="44" viewBox="0 0 24 24" fill={(hoverStar >= star || selectedRating >= star) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              ))}
            </div>

            {selectedRating > 0 && (
              <p className="text-xs text-warm-gray mt-3 italic">
                {selectedRating >= profile.positive_threshold
                  ? "We're glad to hear that!"
                  : 'We appreciate your honesty.'}
              </p>
            )}
          </div>
        )}

        {/* ── Step: Positive → Google Review ── */}
        {step === 'positive' && (
          <div className="animate-[fadeUp_0.4s_ease]">
            <div className="text-ink mb-5">
              <svg className="mx-auto" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className="text-xl font-serif text-ink mb-3">
              We&apos;re so glad!
            </h2>
            <p className="text-sm text-warm-gray mb-8 leading-relaxed">
              Would you mind sharing your experience on Google?<br />
              It helps others find great care.
            </p>
            <a
              href={reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGoogleClick}
              className="inline-flex items-center gap-3 bg-ink text-cream border-2 border-ink rounded-full px-8 py-3.5 text-base font-medium no-underline transition-all duration-200 hover:bg-ink/90"
            >
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Leave a Google Review
            </a>
            <p className="text-xs text-warm-gray mt-6">Thank you for your time!</p>
          </div>
        )}

        {/* ── Step: Negative → Email Manager ── */}
        {step === 'negative' && (
          <div className="animate-[fadeUp_0.4s_ease]">
            <h2 className="text-xl font-serif text-ink mb-3">
              We&apos;d like to make it right
            </h2>
            <p className="text-sm text-warm-gray mb-6 leading-relaxed">
              We&apos;re sorry your experience didn&apos;t meet expectations. Please share
              your feedback directly with our {profile.manager_name.toLowerCase()} so we can improve.
            </p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Tell us what happened (optional)..."
              rows={4}
              className="w-full p-3.5 bg-ink border border-ink rounded-xl text-sm text-cream resize-y outline-none focus:ring-2 focus:ring-warm-gray leading-relaxed mb-5 placeholder:text-warm-gray"
            />
            <a
              href={`mailto:${profile.manager_email}?subject=${encodeURIComponent('Feedback about my visit')}&body=${encodeURIComponent(feedbackText || "I'd like to share feedback about my recent visit.")}`}
              onClick={handleEmailClick}
              className="inline-flex items-center gap-3 text-cream rounded-full px-8 py-3.5 text-base font-medium no-underline"
              style={{
                background: primary,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              Contact {profile.manager_name}
            </a>
            <p className="text-xs text-warm-gray mt-6 leading-relaxed">
              Your feedback goes directly to our team.<br />
              We appreciate you helping us improve.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 text-center py-3 bg-gradient-to-t from-cream via-cream to-transparent relative z-10">
        <span className="text-[11px] text-warm-border">Powered by lseo.app</span>
      </div>
    </div>
  )
}
