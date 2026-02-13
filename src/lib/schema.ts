import type { Location, GBPProfile, GBPHoursPeriod, GBPMedia, LocalLander } from '@/lib/types'
import type { LanderAIContent } from '@/lib/ai/generate-lander-content'
import { getTemplate } from '@/lib/lander-templates'

/**
 * Maps GBP primary_category_id (gcid:xxx) to Schema.org @type.
 * Falls back to LocalBusiness for unknown categories.
 */
const CATEGORY_TO_SCHEMA: Record<string, string> = {
  'gcid:dentist': 'Dentist',
  'gcid:dental_clinic': 'Dentist',
  'gcid:doctor': 'Physician',
  'gcid:physician': 'Physician',
  'gcid:hospital': 'Hospital',
  'gcid:medical_clinic': 'MedicalClinic',
  'gcid:pharmacy': 'Pharmacy',
  'gcid:veterinarian': 'VeterinaryCare',
  'gcid:chiropractor': 'Chiropractor',
  'gcid:optometrist': 'Optician',
  'gcid:physical_therapist': 'PhysicalTherapy',
  'gcid:restaurant': 'Restaurant',
  'gcid:cafe': 'CafeOrCoffeeShop',
  'gcid:bar': 'BarOrPub',
  'gcid:bakery': 'Bakery',
  'gcid:plumber': 'Plumber',
  'gcid:electrician': 'Electrician',
  'gcid:hvac_contractor': 'HVACBusiness',
  'gcid:roofing_contractor': 'RoofingContractor',
  'gcid:locksmith': 'Locksmith',
  'gcid:moving_company': 'MovingCompany',
  'gcid:lawyer': 'Attorney',
  'gcid:law_firm': 'LegalService',
  'gcid:accounting_firm': 'AccountingService',
  'gcid:insurance_agency': 'InsuranceAgency',
  'gcid:real_estate_agency': 'RealEstateAgent',
  'gcid:auto_repair_shop': 'AutoRepair',
  'gcid:car_dealer': 'AutoDealer',
  'gcid:gas_station': 'GasStation',
  'gcid:gym': 'HealthClub',
  'gcid:hair_salon': 'HairSalon',
  'gcid:beauty_salon': 'BeautySalon',
  'gcid:spa': 'DaySpa',
  'gcid:hotel': 'Hotel',
  'gcid:school': 'School',
  'gcid:church': 'Church',
  'gcid:store': 'Store',
  'gcid:clothing_store': 'ClothingStore',
  'gcid:grocery_store': 'GroceryStore',
  'gcid:hardware_store': 'HardwareStore',
  'gcid:pet_store': 'PetStore',
  'gcid:florist': 'Florist',
  'gcid:travel_agency': 'TravelAgency',
  'gcid:library': 'Library',
}

const DAY_MAP: Record<string, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
}

function formatSchemaTime(time: string): string {
  // GBP times come as "HH:MM" or { hours, minutes }
  if (typeof time === 'string') return time
  return '00:00'
}

function buildOpeningHours(hours: { periods?: GBPHoursPeriod[] }): object[] | undefined {
  if (!hours?.periods?.length) return undefined

  return hours.periods.map((period) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: DAY_MAP[period.openDay] || period.openDay,
    opens: formatSchemaTime(period.openTime),
    closes: formatSchemaTime(period.closeTime),
  }))
}

interface SchemaInput {
  location: Location
  gbp: GBPProfile | null
  lander: LocalLander
  reviewStats?: { averageRating: number; reviewCount: number } | null
  photos?: GBPMedia[]
}

/**
 * Generate JSON-LD structured data for a local lander page.
 * Returns an array: [LocalBusiness schema, optional FAQPage schema]
 */
export function generateJsonLd({ location, gbp, lander, reviewStats, photos }: SchemaInput): object[] {
  // Determine Schema.org @type — prefer template's type, then GBP category, then fallback
  const template = getTemplate(lander.template_id || 'general')
  let schemaType = template.schemaType
  if (schemaType === 'LocalBusiness' && gbp?.primary_category_id) {
    schemaType = CATEGORY_TO_SCHEMA[gbp.primary_category_id] || schemaType
  }
  if (location.type === 'practitioner' && schemaType === 'LocalBusiness') {
    schemaType = 'Physician'
  }

  const address = gbp?.address as Record<string, string> | undefined
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://use.revet.app'

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: lander.heading || gbp?.business_name || location.name,
    url: `${appUrl}/l/${lander.slug}`,
  }

  // Description
  const desc = lander.custom_about || lander.description || gbp?.description
  if (desc) schema.description = desc

  // Telephone
  const phone = gbp?.phone_primary || location.phone
  if (phone) schema.telephone = phone

  // Address (only for non-SAB)
  if (location.type !== 'service_area') {
    const postalAddress: Record<string, string> = { '@type': 'PostalAddress' }
    if (address?.addressLines?.[0] || location.address_line1) {
      postalAddress.streetAddress = (address as any)?.addressLines?.[0] || location.address_line1 || ''
    }
    if (address?.locality || location.city) {
      postalAddress.addressLocality = address?.locality || location.city || ''
    }
    if (address?.administrativeArea || location.state) {
      postalAddress.addressRegion = address?.administrativeArea || location.state || ''
    }
    if (address?.postalCode || location.postal_code) {
      postalAddress.postalCode = address?.postalCode || location.postal_code || ''
    }
    if (address?.regionCode || location.country) {
      postalAddress.addressCountry = address?.regionCode || location.country || ''
    }
    schema.address = postalAddress
  }

  // Service area
  if (location.type === 'service_area' && gbp?.service_area) {
    schema.areaServed = gbp.service_area
  }

  // Geo coordinates
  if (gbp?.latitude && gbp?.longitude) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: gbp.latitude,
      longitude: gbp.longitude,
    }
  }

  // Opening hours
  const hours = lander.custom_hours || gbp?.regular_hours
  if (hours) {
    const openingHours = buildOpeningHours(hours as { periods?: GBPHoursPeriod[] })
    if (openingHours?.length) {
      schema.openingHoursSpecification = openingHours
    }
  }

  // Aggregate rating from review sources
  if (reviewStats && reviewStats.reviewCount > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: reviewStats.averageRating.toFixed(1),
      reviewCount: reviewStats.reviewCount,
    }
  }

  // Website
  if (gbp?.website_uri) schema.sameAs = gbp.website_uri

  // Maps link
  if (gbp?.maps_uri) schema.hasMap = gbp.maps_uri

  // Images — photos from GBP, fallback to logo
  if (photos && photos.length > 0) {
    schema.image = photos
      .filter((p) => p.google_url)
      .map((p) => p.google_url)
  } else if (lander.logo_url) {
    schema.image = lander.logo_url
  }

  // Primary category name
  if (gbp?.primary_category_name) {
    schema.additionalType = gbp.primary_category_name
  }

  // Services — hasOfferCatalog
  const services = lander.custom_services
  if (services && services.length > 0) {
    const ai = lander.ai_content as LanderAIContent | null
    schema.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Services',
      itemListElement: services.map((svc) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: svc.name,
          ...(svc.description || ai?.service_descriptions?.[svc.name]
            ? { description: svc.description || ai?.service_descriptions?.[svc.name] }
            : {}),
        },
      })),
    }
  }

  const schemas: object[] = [schema]

  // BreadcrumbList — Home > Locations > {State} > {City} > {Name}
  const breadcrumbItems: Array<{ name: string; url?: string }> = [
    { name: 'Home', url: appUrl },
    { name: 'Locations', url: `${appUrl}/l` },
  ]
  if (location.state) {
    breadcrumbItems.push({ name: location.state })
  }
  if (location.city) {
    breadcrumbItems.push({ name: location.city })
  }
  breadcrumbItems.push({
    name: lander.heading || gbp?.business_name || location.name,
    url: `${appUrl}/l/${lander.slug}`,
  })

  schemas.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  })

  // FAQPage schema — separate graph node
  const faq = lander.custom_faq || (lander.ai_content as LanderAIContent | null)?.faq
  if (lander.show_faq && faq && faq.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    })
  }

  return schemas
}
