import type { Location, GBPProfile, GBPHoursPeriod, LocalLander } from '@/lib/types'

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
}

/**
 * Generate JSON-LD structured data for a local lander page.
 */
export function generateJsonLd({ location, gbp, lander, reviewStats }: SchemaInput): object {
  // Determine Schema.org @type
  let schemaType = 'LocalBusiness'
  if (gbp?.primary_category_id) {
    schemaType = CATEGORY_TO_SCHEMA[gbp.primary_category_id] || 'LocalBusiness'
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

  // Logo
  if (lander.logo_url) schema.image = lander.logo_url

  // Primary category name
  if (gbp?.primary_category_name) {
    schema.additionalType = gbp.primary_category_name
  }

  return schema
}
