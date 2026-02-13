import type { Location, GBPProfile, GBPHoursPeriod, GBPMedia, LocalLander, Review } from '@/lib/types'
import type { LanderAIContent } from '@/lib/ai/generate-lander-content'
import { getTemplate } from '@/lib/lander-templates'
import type { TemplateSection, TemplateField } from '@/lib/lander-templates'
import { GoogleMapEmbed } from '@/components/google-map-embed'

interface NearbyLocation {
  id: string
  name: string
  city: string | null
  state: string | null
  lander_slug: string
}

interface LanderProps {
  lander: LocalLander
  location: Location
  gbp: GBPProfile | null
  photos: GBPMedia[]
  reviews: Review[]
  reviewStats: { averageRating: number; reviewCount: number } | null
  nearbyLocations: NearbyLocation[]
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

export function LocalLanderPage({ lander, location, gbp, photos, reviews, reviewStats, nearbyLocations }: LanderProps) {
  const primary = lander.primary_color || '#1B4965'
  const address = formatAddress(location)
  const phone = gbp?.phone_primary || location.phone
  const ai = lander.ai_content as LanderAIContent | null
  const description = lander.custom_about || lander.description || gbp?.description
  const localContext = ai?.local_context || null
  const hours = (lander.custom_hours || gbp?.regular_hours) as { periods?: GBPHoursPeriod[] } | null
  const name = lander.heading || gbp?.business_name || location.name
  const website = gbp?.website_uri || null
  const mapsUri = gbp?.maps_uri || null
  const services = lander.custom_services || null
  const aiServiceDescriptions = ai?.service_descriptions || null
  const faq = lander.custom_faq || ai?.faq || null
  const reviewHighlights = ai?.review_highlights || null
  const templateData = lander.template_data || {}

  const template = getTemplate(lander.template_id || 'general')

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

  // Render a single section based on its definition
  function renderSection(section: TemplateSection, index: number) {
    // Built-in sections
    if (section.builtIn) {
      switch (section.id) {
        case 'contact':
          return <ContactSection key={index} address={address} phone={phone} email={location.email} website={website} locationType={location.type} directionsUrl={directionsUrl} primary={primary} />
        case 'about':
          return description || localContext ? (
            <section key={index}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.label}</h2>
              {description && <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{description}</p>}
              {localContext && (
                <div className={description ? 'mt-4' : ''}>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{localContext}</p>
                </div>
              )}
            </section>
          ) : null
        case 'hours':
          return hours?.periods && hours.periods.length > 0 ? (
            <section key={index}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.label}</h2>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                {DAY_ORDER.map((day) => {
                  const slots = hoursByDay[day]
                  return (
                    <div key={day} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-600 font-medium w-12">{DAY_SHORT[day]}</span>
                      <span className="text-gray-700">
                        {slots
                          ? slots.map((s, i) => (
                              <span key={i}>{i > 0 && ', '}{formatTime(s.opens)} – {formatTime(s.closes)}</span>
                            ))
                          : <span className="text-gray-400">Closed</span>
                        }
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null
        case 'services':
          return services && services.length > 0 ? (
            <section key={index}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.label}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {services.map((svc, i) => {
                  const desc = svc.description || aiServiceDescriptions?.[svc.name] || null
                  return (
                    <div key={i} className="border border-gray-100 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">{svc.name}</h3>
                      {desc && <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>}
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null
        case 'reviews':
          return lander.show_reviews && reviewStats && reviewStats.reviewCount > 0 ? (
            <section key={index}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.label}</h2>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl font-bold text-gray-900">{reviewStats.averageRating.toFixed(1)}</span>
                <div>
                  <StarRating rating={reviewStats.averageRating} size="lg" />
                  <p className="text-xs text-gray-500 mt-0.5">{reviewStats.reviewCount} reviews</p>
                </div>
              </div>
              {reviewHighlights && (
                <p className="text-sm text-gray-600 leading-relaxed mb-5">{reviewHighlights}</p>
              )}
              {reviews.length > 0 && (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{review.reviewer_name || 'Anonymous'}</span>
                          {review.rating && <StarRating rating={review.rating} />}
                        </div>
                        <span className="text-xs text-gray-400">{new Date(review.published_at).toLocaleDateString()}</span>
                      </div>
                      {review.body && <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{review.body}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null
        case 'faq':
          return lander.show_faq && faq && faq.length > 0 ? (
            <section key={index}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.label}</h2>
              <div className="space-y-4">
                {faq.map((item, i) => (
                  <div key={i}>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{item.question}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null
        case 'map':
          return lander.show_map && gbp?.latitude && gbp?.longitude && location.type !== 'service_area' ? (
            <section key={index}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.label}</h2>
              <div className="rounded-lg overflow-hidden border border-gray-100">
                <GoogleMapEmbed
                  title={`Map of ${name}`}
                  latitude={gbp.latitude}
                  longitude={gbp.longitude}
                />
              </div>
            </section>
          ) : null
        default:
          return null
      }
    }

    // Template sections — rendered from template_data fields
    if (!section.fields) return null

    // Check if any field in this section has data
    const hasData = section.fields.some((f) => {
      const val = templateData[f.key]
      if (Array.isArray(val)) return val.length > 0
      if (typeof val === 'string') return val.trim().length > 0
      return !!val
    })
    if (!hasData) return null

    return (
      <section key={index}>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.label}</h2>
        <div className="space-y-4">
          {section.fields.map((field) => renderField(field))}
        </div>
      </section>
    )
  }

  // Render a single template field
  function renderField(field: TemplateField) {
    const val = templateData[field.key]
    if (!val) return null

    switch (field.type) {
      case 'list': {
        const items = Array.isArray(val) ? val as string[] : []
        if (items.length === 0) return null
        return (
          <div key={field.key} className="flex flex-wrap gap-2">
            {items.map((item, i) => (
              <span
                key={i}
                className="px-3 py-1 text-sm rounded-full border border-gray-200 text-gray-700"
              >
                {item}
              </span>
            ))}
          </div>
        )
      }
      case 'text': {
        const text = typeof val === 'string' ? val : ''
        if (!text) return null
        // If it looks like a URL, render as a link
        if (text.startsWith('http://') || text.startsWith('https://')) {
          return (
            <div key={field.key}>
              <a href={text} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-700 underline">
                {field.label}
              </a>
            </div>
          )
        }
        return (
          <div key={field.key} className="text-sm text-gray-700">
            <span className="font-medium text-gray-900">{field.label}:</span>{' '}
            {text}
          </div>
        )
      }
      case 'textarea': {
        const text = typeof val === 'string' ? val : ''
        if (!text) return null
        return (
          <p key={field.key} className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{text}</p>
        )
      }
      case 'key_value': {
        const entries = typeof val === 'object' && !Array.isArray(val) ? Object.entries(val as Record<string, string>) : []
        if (entries.length === 0) return null
        return (
          <div key={field.key} className="space-y-1">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-gray-900">{k}:</span>
                <span className="text-gray-600">{v}</span>
              </div>
            ))}
          </div>
        )
      }
      default:
        return null
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
        {template.sections.map((section, i) => renderSection(section, i))}

        {/* Photos — rendered after template sections, before nearby */}
        {photos.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Photos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {photos.map((photo) => (
                <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-gray-50">
                  <img
                    src={photo.google_url || photo.thumbnail_url || ''}
                    alt={photo.description || name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    width={photo.width_px || 400}
                    height={photo.height_px || 400}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Nearby locations — internal link graph */}
        {nearbyLocations.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Other Locations</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {nearbyLocations.map((loc) => {
                const geo = [loc.city, loc.state].filter(Boolean).join(', ')
                return (
                  <a
                    key={loc.id}
                    href={`/l/${loc.lander_slug}`}
                    className="flex items-center gap-3 border border-gray-100 rounded-lg p-3 no-underline transition-colors hover:border-gray-300"
                  >
                    <MapPinIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    <div>
                      <span className="text-sm font-medium text-gray-900">{loc.name}</span>
                      {geo && <p className="text-xs text-gray-500">{geo}</p>}
                    </div>
                  </a>
                )
              })}
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

// ---- Sub-components for built-in sections --------------------------------

function ContactSection({
  address, phone, email, website, locationType, directionsUrl, primary,
}: {
  address: string; phone: string | null; email: string | null
  website: string | null; locationType: string; directionsUrl: string | null
  primary: string
}) {
  return (
    <section className="flex flex-col sm:flex-row sm:items-start gap-6">
      <div className="flex-1">
        {locationType !== 'service_area' && address && (
          <div className="flex items-start gap-2.5 mb-3">
            <MapPinIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">{address}</p>
          </div>
        )}
        {locationType === 'service_area' && (
          <div className="flex items-start gap-2.5 mb-3">
            <MapPinIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">Serves your area</p>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-2.5 mb-3">
            <PhoneIcon className="w-4 h-4 text-gray-400 shrink-0" />
            <a href={`tel:${phone}`} className="text-sm text-gray-700 no-underline hover:underline">{phone}</a>
          </div>
        )}
        {email && (
          <div className="flex items-center gap-2.5 mb-3">
            <EmailIcon className="w-4 h-4 text-gray-400 shrink-0" />
            <a href={`mailto:${email}`} className="text-sm text-gray-700 no-underline hover:underline">{email}</a>
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
        {directionsUrl && locationType !== 'service_area' && (
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
  )
}

// ---- Icons ---------------------------------------------------------------

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
