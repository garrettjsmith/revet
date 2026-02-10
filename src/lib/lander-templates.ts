import type { LocationType } from '@/lib/types'

// ---- Section + field definitions ----------------------------------------

/**
 * Built-in sections are always rendered by the lander component
 * when the underlying data exists (hours from GBP, reviews from sources, etc).
 *
 * Template sections are rendered from template_data fields and are
 * specific to a template (e.g. "specialties" for medical, "brands" for distributor).
 */
export type BuiltInSection =
  | 'contact'   // NAP + CTA buttons — always first
  | 'about'     // Description / about text
  | 'hours'     // GBP opening hours
  | 'services'  // custom_services on lander
  | 'reviews'   // Aggregate rating + recent reviews
  | 'faq'       // custom_faq on lander
  | 'map'       // Google Maps embed

export interface TemplateSection {
  id: string                 // 'specialties', 'insurance', or a BuiltInSection
  label: string              // Heading on the public page
  builtIn?: boolean          // True for built-in sections (no fields needed)
  fields?: TemplateField[]   // Fields that power this section (for template sections)
}

export type FieldType = 'list' | 'text' | 'textarea' | 'key_value'

export interface TemplateField {
  key: string            // Key in template_data JSON
  label: string          // Label in admin form
  type: FieldType        // Determines rendering and input
  placeholder?: string
}

// ---- Template definition -------------------------------------------------

export interface LanderTemplate {
  id: string
  label: string
  description: string
  schemaType: string          // Schema.org @type
  sections: TemplateSection[] // Ordered list of sections for the page
}

// ---- Built-in section helpers -------------------------------------------

const CONTACT: TemplateSection = { id: 'contact', label: 'Contact', builtIn: true }
const ABOUT: TemplateSection = { id: 'about', label: 'About', builtIn: true }
const HOURS: TemplateSection = { id: 'hours', label: 'Hours', builtIn: true }
const SERVICES: TemplateSection = { id: 'services', label: 'Services', builtIn: true }
const REVIEWS: TemplateSection = { id: 'reviews', label: 'Reviews', builtIn: true }
const FAQ: TemplateSection = { id: 'faq', label: 'Frequently Asked Questions', builtIn: true }
const MAP: TemplateSection = { id: 'map', label: 'Location', builtIn: true }

// ---- Templates ----------------------------------------------------------

export const LANDER_TEMPLATES: LanderTemplate[] = [
  {
    id: 'general',
    label: 'General Business',
    description: 'Default template for any business type',
    schemaType: 'LocalBusiness',
    sections: [
      CONTACT, ABOUT, SERVICES, HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'medical_practice',
    label: 'Medical Practice',
    description: 'Doctors, clinics, hospitals, urgent care',
    schemaType: 'MedicalClinic',
    sections: [
      CONTACT, ABOUT,
      {
        id: 'specialties',
        label: 'Specialties',
        fields: [
          { key: 'specialties', label: 'Specialties', type: 'list', placeholder: 'e.g. Cardiology, Internal Medicine, Pediatrics' },
        ],
      },
      {
        id: 'insurance',
        label: 'Insurance Accepted',
        fields: [
          { key: 'insurance_accepted', label: 'Insurance Providers', type: 'list', placeholder: 'e.g. Aetna, BlueCross, United Healthcare' },
        ],
      },
      {
        id: 'credentials',
        label: 'Credentials',
        fields: [
          { key: 'board_certifications', label: 'Board Certifications', type: 'textarea', placeholder: 'Board certifications, affiliations, awards' },
          { key: 'npi_number', label: 'NPI Number', type: 'text' },
        ],
      },
      SERVICES, HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'dental_practice',
    label: 'Dental Practice',
    description: 'Dentists, orthodontists, oral surgeons',
    schemaType: 'Dentist',
    sections: [
      CONTACT, ABOUT,
      {
        id: 'dental_services',
        label: 'Dental Services',
        fields: [
          { key: 'dental_services', label: 'Services Offered', type: 'list', placeholder: 'e.g. Cleanings, Crowns, Implants, Invisalign' },
        ],
      },
      {
        id: 'insurance',
        label: 'Insurance Accepted',
        fields: [
          { key: 'insurance_accepted', label: 'Insurance Providers', type: 'list', placeholder: 'e.g. Delta Dental, Cigna, MetLife' },
        ],
      },
      {
        id: 'credentials',
        label: 'Credentials',
        fields: [
          { key: 'board_certifications', label: 'Certifications & Affiliations', type: 'textarea', placeholder: 'ADA membership, board certifications' },
        ],
      },
      HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'legal_practice',
    label: 'Legal Practice',
    description: 'Lawyers, law firms, legal services',
    schemaType: 'LegalService',
    sections: [
      CONTACT, ABOUT,
      {
        id: 'practice_areas',
        label: 'Practice Areas',
        fields: [
          { key: 'practice_areas', label: 'Practice Areas', type: 'list', placeholder: 'e.g. Personal Injury, Family Law, Criminal Defense' },
        ],
      },
      {
        id: 'credentials',
        label: 'Credentials',
        fields: [
          { key: 'bar_admissions', label: 'Bar Admissions', type: 'list', placeholder: 'e.g. Florida Bar, New York Bar' },
          { key: 'awards', label: 'Awards & Recognition', type: 'textarea', placeholder: 'Super Lawyers, Martindale-Hubbell ratings, etc.' },
        ],
      },
      HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'restaurant',
    label: 'Restaurant / Food',
    description: 'Restaurants, cafes, bakeries, bars',
    schemaType: 'Restaurant',
    sections: [
      CONTACT, ABOUT,
      {
        id: 'amenities',
        label: 'Amenities',
        fields: [
          { key: 'amenities', label: 'Amenities', type: 'list', placeholder: 'e.g. Outdoor Seating, WiFi, Parking, Delivery' },
        ],
      },
      {
        id: 'cuisine',
        label: 'Cuisine & Menu',
        fields: [
          { key: 'cuisine_types', label: 'Cuisine Types', type: 'list', placeholder: 'e.g. Italian, Seafood, Farm-to-Table' },
          { key: 'menu_url', label: 'Menu URL', type: 'text', placeholder: 'https://...' },
        ],
      },
      HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'home_services',
    label: 'Home Services',
    description: 'Plumbers, electricians, HVAC, roofers, landscapers',
    schemaType: 'HomeAndConstructionBusiness',
    sections: [
      CONTACT, ABOUT, SERVICES,
      {
        id: 'service_area_info',
        label: 'Service Area',
        fields: [
          { key: 'areas_served', label: 'Areas Served', type: 'list', placeholder: 'e.g. Miami-Dade, Broward County, Palm Beach' },
          { key: 'emergency_service', label: 'Emergency Service', type: 'text', placeholder: 'e.g. 24/7 Emergency Service Available' },
        ],
      },
      {
        id: 'licensing',
        label: 'Licensing & Certifications',
        fields: [
          { key: 'license_number', label: 'License Number', type: 'text', placeholder: 'e.g. CFC1234567' },
          { key: 'certifications', label: 'Certifications', type: 'list', placeholder: 'e.g. EPA Certified, NATE Certified' },
        ],
      },
      HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'professional_services',
    label: 'Professional Services',
    description: 'Accountants, financial advisors, insurance agents, consultants',
    schemaType: 'ProfessionalService',
    sections: [
      CONTACT, ABOUT, SERVICES,
      {
        id: 'credentials',
        label: 'Credentials',
        fields: [
          { key: 'certifications', label: 'Certifications & Licenses', type: 'list', placeholder: 'e.g. CPA, CFP, Series 7' },
          { key: 'affiliations', label: 'Professional Affiliations', type: 'textarea', placeholder: 'Member of AICPA, NAPFA, etc.' },
        ],
      },
      HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'retail',
    label: 'Retail / Store',
    description: 'Shops, boutiques, specialty stores',
    schemaType: 'Store',
    sections: [
      CONTACT, ABOUT,
      {
        id: 'products',
        label: 'Products & Brands',
        fields: [
          { key: 'product_categories', label: 'Product Categories', type: 'list', placeholder: 'e.g. Electronics, Clothing, Home Goods' },
          { key: 'brands_carried', label: 'Brands Carried', type: 'list', placeholder: 'e.g. Nike, Apple, Samsung' },
        ],
      },
      {
        id: 'amenities',
        label: 'Store Features',
        fields: [
          { key: 'amenities', label: 'Features', type: 'list', placeholder: 'e.g. Curbside Pickup, Gift Wrapping, Free Parking' },
        ],
      },
      HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'automotive',
    label: 'Automotive',
    description: 'Auto repair, dealers, body shops',
    schemaType: 'AutoRepair',
    sections: [
      CONTACT, ABOUT, SERVICES,
      {
        id: 'brands',
        label: 'Brands Serviced',
        fields: [
          { key: 'brands_serviced', label: 'Brands / Makes', type: 'list', placeholder: 'e.g. Toyota, Honda, Ford, BMW' },
        ],
      },
      {
        id: 'certifications',
        label: 'Certifications',
        fields: [
          { key: 'certifications', label: 'Certifications', type: 'list', placeholder: 'e.g. ASE Certified, AAA Approved' },
        ],
      },
      HOURS, REVIEWS, FAQ, MAP,
    ],
  },
  {
    id: 'distributor',
    label: 'Distributor / Warehouse',
    description: 'Wholesale distributors, supply houses, warehouses',
    schemaType: 'LocalBusiness',
    sections: [
      CONTACT, ABOUT,
      {
        id: 'products',
        label: 'Products & Equipment',
        fields: [
          { key: 'product_lines', label: 'Product Lines', type: 'list', placeholder: 'e.g. HVAC Equipment, Plumbing Supplies, Electrical' },
          { key: 'brands_carried', label: 'Brands Carried', type: 'list', placeholder: 'e.g. Carrier, Trane, Rheem, Lennox' },
        ],
      },
      {
        id: 'service_area_info',
        label: 'Service Area',
        fields: [
          { key: 'areas_served', label: 'Areas Served', type: 'list', placeholder: 'e.g. Southeast Florida, Tampa Bay Area' },
          { key: 'delivery_info', label: 'Delivery Information', type: 'text', placeholder: 'e.g. Same-day delivery available' },
        ],
      },
      {
        id: 'trade_info',
        label: 'For Contractors',
        fields: [
          { key: 'trade_programs', label: 'Contractor Programs', type: 'textarea', placeholder: 'Loyalty programs, contractor pricing, training offered' },
        ],
      },
      HOURS, REVIEWS, FAQ, MAP,
    ],
  },
]

// ---- Auto-detection mapping ---------------------------------------------

/**
 * Maps GBP primary_category_id → template ID.
 * Falls back to location.type → template, then 'general'.
 */
const CATEGORY_TO_TEMPLATE: Record<string, string> = {
  // Medical
  'gcid:doctor': 'medical_practice',
  'gcid:physician': 'medical_practice',
  'gcid:hospital': 'medical_practice',
  'gcid:medical_clinic': 'medical_practice',
  'gcid:pharmacy': 'medical_practice',
  'gcid:veterinarian': 'medical_practice',
  'gcid:chiropractor': 'medical_practice',
  'gcid:optometrist': 'medical_practice',
  'gcid:physical_therapist': 'medical_practice',
  'gcid:urgent_care_center': 'medical_practice',
  'gcid:medical_center': 'medical_practice',

  // Dental
  'gcid:dentist': 'dental_practice',
  'gcid:dental_clinic': 'dental_practice',
  'gcid:orthodontist': 'dental_practice',
  'gcid:oral_surgeon': 'dental_practice',
  'gcid:periodontist': 'dental_practice',
  'gcid:endodontist': 'dental_practice',
  'gcid:pediatric_dentist': 'dental_practice',

  // Legal
  'gcid:lawyer': 'legal_practice',
  'gcid:law_firm': 'legal_practice',
  'gcid:attorney': 'legal_practice',
  'gcid:legal_services': 'legal_practice',

  // Restaurant / Food
  'gcid:restaurant': 'restaurant',
  'gcid:cafe': 'restaurant',
  'gcid:bar': 'restaurant',
  'gcid:bakery': 'restaurant',
  'gcid:pizza_restaurant': 'restaurant',
  'gcid:fast_food_restaurant': 'restaurant',
  'gcid:coffee_shop': 'restaurant',
  'gcid:ice_cream_shop': 'restaurant',
  'gcid:food_truck': 'restaurant',

  // Home Services
  'gcid:plumber': 'home_services',
  'gcid:electrician': 'home_services',
  'gcid:hvac_contractor': 'home_services',
  'gcid:roofing_contractor': 'home_services',
  'gcid:locksmith': 'home_services',
  'gcid:moving_company': 'home_services',
  'gcid:general_contractor': 'home_services',
  'gcid:painter': 'home_services',
  'gcid:landscaper': 'home_services',
  'gcid:pest_control_service': 'home_services',
  'gcid:cleaning_service': 'home_services',
  'gcid:garage_door_supplier': 'home_services',
  'gcid:pool_contractor': 'home_services',
  'gcid:fence_contractor': 'home_services',

  // Professional Services
  'gcid:accounting_firm': 'professional_services',
  'gcid:insurance_agency': 'professional_services',
  'gcid:real_estate_agency': 'professional_services',
  'gcid:financial_planner': 'professional_services',
  'gcid:tax_preparation_service': 'professional_services',
  'gcid:consultant': 'professional_services',
  'gcid:notary_public': 'professional_services',

  // Retail
  'gcid:store': 'retail',
  'gcid:clothing_store': 'retail',
  'gcid:grocery_store': 'retail',
  'gcid:hardware_store': 'retail',
  'gcid:pet_store': 'retail',
  'gcid:florist': 'retail',
  'gcid:jewelry_store': 'retail',
  'gcid:furniture_store': 'retail',
  'gcid:book_store': 'retail',
  'gcid:electronics_store': 'retail',
  'gcid:convenience_store': 'retail',
  'gcid:department_store': 'retail',
  'gcid:sporting_goods_store': 'retail',
  'gcid:toy_store': 'retail',
  'gcid:shoe_store': 'retail',

  // Automotive
  'gcid:auto_repair_shop': 'automotive',
  'gcid:car_dealer': 'automotive',
  'gcid:gas_station': 'automotive',
  'gcid:auto_body_shop': 'automotive',
  'gcid:auto_parts_store': 'automotive',
  'gcid:tire_shop': 'automotive',
  'gcid:car_wash': 'automotive',
  'gcid:oil_change_service': 'automotive',
}

const LOCATION_TYPE_FALLBACK: Record<LocationType, string> = {
  place: 'general',
  practitioner: 'medical_practice',
  service_area: 'home_services',
}

/**
 * Auto-detect the best template for a location based on GBP category + location type.
 */
export function detectTemplate(
  gbpCategoryId: string | null,
  locationType: LocationType,
): string {
  if (gbpCategoryId && CATEGORY_TO_TEMPLATE[gbpCategoryId]) {
    return CATEGORY_TO_TEMPLATE[gbpCategoryId]
  }
  return LOCATION_TYPE_FALLBACK[locationType]
}

/**
 * Get a template by ID. Returns 'general' if not found.
 */
export function getTemplate(templateId: string): LanderTemplate {
  return LANDER_TEMPLATES.find((t) => t.id === templateId) || LANDER_TEMPLATES[0]
}

/**
 * Get all template fields (flattened from sections) for a given template.
 */
export function getTemplateFields(templateId: string): TemplateField[] {
  const template = getTemplate(templateId)
  return template.sections.flatMap((s) => s.fields || [])
}

/**
 * Get only the template-specific (non-built-in) sections.
 */
export function getTemplateSections(templateId: string): TemplateSection[] {
  const template = getTemplate(templateId)
  return template.sections.filter((s) => !s.builtIn)
}
