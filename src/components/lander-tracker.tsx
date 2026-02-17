'use client'

import { useEffect, useRef } from 'react'

interface TrackerProps {
  landerId: string
  locationId: string
}

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let sid = sessionStorage.getItem('revet_lander_sid')
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem('revet_lander_sid', sid)
  }
  return sid
}

function trackEvent(landerId: string, locationId: string, eventType: string) {
  const body = JSON.stringify({
    lander_id: landerId,
    location_id: locationId,
    event_type: eventType,
    session_id: getSessionId(),
  })

  // Use sendBeacon for reliability (fires even on navigation)
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/lander-events', new Blob([body], { type: 'application/json' }))
  } else {
    fetch('/api/lander-events', { method: 'POST', body, keepalive: true })
  }
}

/**
 * Client component that tracks lander page views and CTA clicks.
 * Listens for click events on tel:, directions, and website links.
 */
export function LanderTracker({ landerId, locationId }: TrackerProps) {
  const tracked = useRef(false)

  useEffect(() => {
    // Track page view once
    if (!tracked.current) {
      tracked.current = true
      trackEvent(landerId, locationId, 'page_view')
    }

    // Delegate click events for CTA tracking
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return

      const href = target.getAttribute('href') || ''

      if (href.startsWith('tel:')) {
        trackEvent(landerId, locationId, 'phone_click')
      } else if (
        href.includes('google.com/maps') ||
        href.includes('maps/embed') ||
        target.textContent?.includes('Directions')
      ) {
        trackEvent(landerId, locationId, 'directions_click')
      } else if (
        target.textContent?.includes('Visit Website') ||
        (href.startsWith('http') && !href.includes(window.location.hostname))
      ) {
        trackEvent(landerId, locationId, 'website_click')
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [landerId, locationId])

  return null
}
