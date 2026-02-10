'use client'

import type { Location, GBPProfile, GBPHoursPeriod, LocalLander, Review } from '@/lib/types'

interface LanderProps {
  lander: LocalLander
  location: Location
  gbp: GBPProfile | null
  reviews: Review[]
  reviewStats: { averageRating: number; reviewCount: number } | null
}

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

function formatTime(time: string): string {
  if (!time || !time.includes(':')) return time
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatAddress(location: Location): string {
  const parts = [location.address_line1]
  if (location.address_line2) parts.push(location.address_line2)
  const cityState = [location.city, location.state].filter(Boolean).join(', ')
  if (cityState) parts.push(cityState)
  if (location.postal_code) parts[parts.length - 1] += ` ${location.postal_code}`
  return parts.filter(Boolean).join(', ')
}

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const px = size === 'lg' ? 20 : 14
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          width={px}
          height={px}
          viewBox="0 0 24 24"
          fill={star <= Math.round(rating) ? '#FBBF24' : '#E5E7EB'}
          stroke="none"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  )
}

export function LocalLanderPage({ lander, location, gbp, reviews, reviewStats }: LanderProps) {
  const primary = lander.primary_color || '#1B4965'
  const address = formatAddress(location)
  const phone = gbp?.phone_primary || location.phone
  const description = lander.custom_about || lander.description || gbp?.description
  const hours = (lander.custom_hours || gbp?.regular_hours) as { periods?: GBPHoursPeriod[] } | null
  const name = lander.heading || gbp?.business_name || location.name
  const website = gbp?.website_uri
  const mapsUri = gbp?.maps_uri
  const services = lander.custom_services || null
  const faq = lander.custom_faq || null

  // Build directions URL
  const directionsUrl = mapsUri || (
    address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null
  )

  // Group hours by day
  const hoursByDay: Record<string, { opens: string; closes: string }[]> = {}
  if (hours?.periods) {
    for (const period of hours.periods) {
      const day = period.openDay
      if (!hoursByDay[day]) hoursByDay[day] = []
      hoursByDay[day].push({ opens: period.openTime, closes: period.closeTime })
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center gap-4">
          {lander.logo_url ? (
            <img src={lander.logo_url} alt={name} className="h-12 object-contain" />
          ) : (
            <div
              className="h-12 px-5 rounded-lg flex items-center text-white font-bold text-lg tracking-wide"
              style={{ background: primary }}
            >
              {name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{name}</h1>
            {gbp?.primary_category_name && (
              <p className="text-sm text-gray-500">{gbp.primary_category_name}</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {/* NAP + Contact CTAs */}
        <section className="flex flex-col sm:flex-row sm:items-start gap-6">
          <div className="flex-1">
            {location.type !== 'service_area' && address && (
              <div className="flex items-start gap-2.5 mb-3">
                <MapPinIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-700">{address}</p>
              </div>
            )}
            {location.type === 'service_area' && (
              <div className="flex items-start gap-2.5 mb-3">
                <MapPinIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-700">Serves your area</p>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-2.5 mb-3">
                <PhoneIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <a href={`tel:${phone}`} className="text-sm text-gray-700 no-underline hover:underline">
                  {phone}
                </a>
              </div>
            )}
            {location.email && (
              <div className="flex items-center gap-2.5 mb-3">
                <EmailIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <a href={`mailto:${location.email}`} className="text-sm text-gray-700 no-underline hover:underline">
                  {location.email}
                </a>
              </div>
            )}
            {website && (
              <div className="flex items-center gap-2.5">
                <GlobeIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <a href={website} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-700 no-underline hover:underline">
                  {new URL(website).hostname}
                </a>
              </div>
            )}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-2.5 sm:w-48 shrink-0">
            {phone && (
              <a
                href={`tel:${phone}`}
                className="flex items-center justify-center gap-2 text-white text-sm font-medium rounded-lg px-4 py-2.5 no-underline transition-opacity hover:opacity-90"
                style={{ background: primary }}
              >
                <PhoneIcon className="w-4 h-4" />
                Call Now
              </a>
            )}
            {directionsUrl && location.type !== 'service_area' && (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg px-4 py-2.5 no-underline transition-colors hover:border-gray-400"
              >
                <MapPinIcon className="w-4 h-4" />
                Get Directions
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg px-4 py-2.5 no-underline transition-colors hover:border-gray-400"
              >
                <GlobeIcon className="w-4 h-4" />
                Visit Website
              </a>
            )}
          </div>
        </section>

        {/* About */}
        {description && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">About</h2>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{description}</p>
          </section>
        )}

        {/* Hours */}
        {hours?.periods && hours.periods.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Hours</h2>
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
              {DAY_ORDER.map((day) => {
                const slots = hoursByDay[day]
                return (
                  <div key={day} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-600 font-medium w-12">{DAY_SHORT[day]}</span>
                    <span className="text-gray-700">
                      {slots
                        ? slots.map((s, i) => (
                            <span key={i}>
                              {i > 0 && ', '}
                              {formatTime(s.opens)} – {formatTime(s.closes)}
                            </span>
                          ))
                        : <span className="text-gray-400">Closed</span>
                      }
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Services */}
        {services && services.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Services</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {services.map((svc, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">{svc.name}</h3>
                  {svc.description && (
                    <p className="text-xs text-gray-500 leading-relaxed">{svc.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reviews Summary + Recent Reviews */}
        {lander.show_reviews && reviewStats && reviewStats.reviewCount > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Reviews</h2>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-3xl font-bold text-gray-900">{reviewStats.averageRating.toFixed(1)}</span>
              <div>
                <StarRating rating={reviewStats.averageRating} size="lg" />
                <p className="text-xs text-gray-500 mt-0.5">{reviewStats.reviewCount} reviews</p>
              </div>
            </div>

            {reviews.length > 0 && (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="border border-gray-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {review.reviewer_name || 'Anonymous'}
                        </span>
                        {review.rating && <StarRating rating={review.rating} />}
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(review.published_at).toLocaleDateString()}
                      </span>
                    </div>
                    {review.body && (
                      <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{review.body}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* FAQ */}
        {lander.show_faq && faq && faq.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {faq.map((item, i) => (
                <div key={i}>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">{item.question}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Map embed */}
        {lander.show_map && gbp?.latitude && gbp?.longitude && location.type !== 'service_area' && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Location</h2>
            <div className="rounded-lg overflow-hidden border border-gray-100">
              <iframe
                title={`Map of ${name}`}
                width="100%"
                height="300"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''}&q=${gbp.latitude},${gbp.longitude}&zoom=15`}
              />
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-12">
        <div className="max-w-3xl mx-auto px-6 py-6 text-center">
          <span className="text-xs text-gray-300">Powered by revet.app</span>
        </div>
      </footer>
    </div>
  )
}

// Simple inline SVG icons
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
