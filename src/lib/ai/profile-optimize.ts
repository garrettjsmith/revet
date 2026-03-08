import type { GBPHoursPeriod } from '@/lib/types'
import { getAnthropicClient as getClient } from './client'

/**
 * Generate an optimized business description for a GBP profile.
 */
export async function generateProfileDescription({
  businessName,
  category,
  city,
  state,
  services,
  currentDescription,
  brandVoice,
  correctionsContext,
}: {
  businessName: string
  category: string | null
  city: string | null
  state: string | null
  services: string[]
  currentDescription: string | null
  brandVoice?: string | null
  correctionsContext?: string
}): Promise<string> {
  const location = [city, state].filter(Boolean).join(', ')

  let systemPrompt = `You are a local SEO expert writing Google Business Profile descriptions.

Rules:
- Write exactly one description, 500-750 characters
- Include the business name, location, and primary services naturally
- Use keywords that potential customers would search for
- Be informative and professional, not salesy
- Never use emojis
- Never use "we" or first person
- Do not include phone numbers, URLs, or promotional language
- Do not mention prices or special offers
- Focus on what makes the business valuable to customers`

  if (brandVoice) {
    systemPrompt += `\n\nBrand voice guidelines: ${brandVoice}`
  }

  if (correctionsContext) {
    systemPrompt += `\n\nPrevious edits made by the team (match this tone and style):\n${correctionsContext}`
  }

  const userMessage = `Write an optimized GBP description for:
Business: ${businessName}
Category: ${category || 'Not set'}
Location: ${location || 'Not specified'}
Services: ${services.length > 0 ? services.join(', ') : 'Not specified'}
${currentDescription ? `Current description (improve this): ${currentDescription}` : 'No current description.'}`

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return block.text.trim()
}

/**
 * Suggest additional categories for a GBP profile.
 */
export async function suggestCategories({
  businessName,
  currentCategories,
  services,
}: {
  businessName: string
  currentCategories: string[]
  services: string[]
}): Promise<string[]> {
  const systemPrompt = `You are a local SEO expert. Suggest Google Business Profile categories.

Rules:
- Suggest 3-5 additional categories that would help this business appear in more relevant searches
- Use real Google Business Profile category names (e.g., "Dental clinic", "Emergency dental service")
- Only suggest categories that genuinely apply to the business
- Return one category per line, nothing else
- Do not repeat categories already in use`

  const userMessage = `Business: ${businessName}
Current categories: ${currentCategories.join(', ') || 'None'}
Services: ${services.length > 0 ? services.join(', ') : 'Not specified'}`

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return block.text
    .trim()
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 0)
}

/**
 * Recommend which attributes to enable based on business context.
 * Takes the available attributes from Google and uses AI to pick
 * which ones apply to this specific business.
 */
export async function recommendAttributes({
  businessName,
  category,
  services,
  highlights,
  availableAttributes,
}: {
  businessName: string
  category: string | null
  services: string[]
  highlights: string[]
  availableAttributes: Array<{
    attributeId: string
    displayName: string
    groupDisplayName?: string
    valueType: string
    valueMetadata?: Array<{ value: string; displayName: string }>
  }>
}): Promise<Array<{ attributeId: string; value: boolean | string }>> {
  if (availableAttributes.length === 0) return []

  // Build a compact list of available attributes grouped by type
  const boolAttrs = availableAttributes
    .filter((a) => a.valueType === 'BOOL')
    .map((a) => `- ${a.attributeId}: ${a.displayName}${a.groupDisplayName ? ` (${a.groupDisplayName})` : ''}`)
  const enumAttrs = availableAttributes
    .filter((a) => a.valueType === 'ENUM' && a.valueMetadata)
    .map((a) => `- ${a.attributeId}: ${a.displayName} [${(a.valueMetadata || []).map((v) => v.displayName).join(' | ')}]`)

  const systemPrompt = `You are a local SEO expert recommending Google Business Profile attributes.

Given a business and its available attributes, determine which should be set to true (or which enum value to use).

Rules:
- Only recommend attributes that clearly apply based on the business info
- For boolean attributes, only include ones that should be TRUE (omit false ones)
- For enum attributes, pick the most appropriate value
- Be conservative — wrong attributes hurt more than missing ones
- Return one recommendation per line in format: attribute_id=value
  - For booleans: attribute_id=true
  - For enums: attribute_id=enum_value
- Nothing else — no explanations, no headers`

  const userMessage = `Business: ${businessName}
Category: ${category || 'Unknown'}
Services: ${services.join(', ') || 'Not specified'}
Highlights: ${highlights.join(', ') || 'None'}

Available boolean attributes:
${boolAttrs.join('\n') || 'None'}

Available enum attributes:
${enumAttrs.join('\n') || 'None'}`

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') return []

  const results: Array<{ attributeId: string; value: boolean | string }> = []
  const validIds = new Set(availableAttributes.map((a) => a.attributeId))

  for (const line of block.text.trim().split('\n')) {
    const cleaned = line.replace(/^[-•*]\s*/, '').trim()
    const eqIdx = cleaned.indexOf('=')
    if (eqIdx === -1) continue
    const attrId = cleaned.slice(0, eqIdx).trim()
    const val = cleaned.slice(eqIdx + 1).trim()
    if (!validIds.has(attrId)) continue
    results.push({
      attributeId: attrId,
      value: val === 'true' ? true : val === 'false' ? false : val,
    })
  }

  return results
}

/**
 * Parse free-text hours (from intake form) into GBP-format hour periods.
 */
export async function parseHoursToGBP({
  hoursText,
  businessName,
  category,
}: {
  hoursText: string
  businessName: string
  category: string | null
}): Promise<GBPHoursPeriod[]> {
  const systemPrompt = `You parse business hours text into structured Google Business Profile format.

Output JSON array of period objects. Each period has:
- openDay: MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY
- openTime: HH:MM in 24h format (e.g., "09:00")
- closeDay: same day as openDay (unless overnight)
- closeTime: HH:MM in 24h format (e.g., "17:00")

Rules:
- "Mon-Fri 9-5" means 5 separate periods, one per day
- "24 hours" or "24/7" means openTime "00:00" closeTime "24:00" for each day
- If a day is marked closed, omit it entirely
- Output ONLY the JSON array, nothing else
- If you cannot parse the input, return an empty array []`

  const userMessage = `Business: ${businessName} (${category || 'general'})
Hours: ${hoursText}`

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') return []

  try {
    // Extract JSON from response (may have markdown fences)
    const text = block.text.trim()
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    const validDays = new Set(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])
    return parsed.filter(
      (p: any) =>
        validDays.has(p.openDay) &&
        validDays.has(p.closeDay) &&
        typeof p.openTime === 'string' &&
        typeof p.closeTime === 'string' &&
        /^\d{2}:\d{2}$/.test(p.openTime) &&
        /^\d{2}:\d{2}$/.test(p.closeTime)
    ) as GBPHoursPeriod[]
  } catch {
    return []
  }
}

/**
 * Generate service descriptions for services that don't have them.
 */
export async function generateServiceDescriptions({
  businessName,
  category,
  services,
}: {
  businessName: string
  category: string | null
  services: Array<{ name: string; description?: string }>
}): Promise<Array<{ name: string; description: string }>> {
  const needsDescription = services.filter((s) => !s.description || s.description.trim().length < 20)
  if (needsDescription.length === 0) return []

  const systemPrompt = `You are a local SEO expert writing service descriptions for a Google Business Profile.

Rules:
- Write 1-2 sentences per service (80-150 characters)
- Include relevant keywords customers would search for
- Be specific and informative, not generic
- Never use emojis or promotional language
- Return one service per line in format: ServiceName|Description
- Nothing else — no headers or explanations`

  const userMessage = `Business: ${businessName}
Category: ${category || 'General'}
Services needing descriptions:
${needsDescription.map((s) => `- ${s.name}`).join('\n')}`

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') return []

  return block.text
    .trim()
    .split('\n')
    .map((line) => {
      const cleaned = line.replace(/^[-•*\d.]\s*/, '').trim()
      const pipeIdx = cleaned.indexOf('|')
      if (pipeIdx === -1) return null
      return {
        name: cleaned.slice(0, pipeIdx).trim(),
        description: cleaned.slice(pipeIdx + 1).trim(),
      }
    })
    .filter((r): r is { name: string; description: string } => r !== null && r.description.length > 0)
}

/**
 * Generate a photo shot list based on business type and what's missing.
 */
export async function generatePhotoShotList({
  businessName,
  category,
  services,
  existingCategories,
  totalPhotos,
}: {
  businessName: string
  category: string | null
  services: string[]
  existingCategories: string[]
  totalPhotos: number
}): Promise<Array<{ type: string; description: string; priority: 'high' | 'medium' | 'low' }>> {
  const systemPrompt = `You are a local SEO expert creating a photo shot list for a Google Business Profile.

GBP photo categories: COVER, LOGO, EXTERIOR, INTERIOR, PRODUCT, AT_WORK, FOOD_AND_DRINK, MENU, COMMON_AREA, ROOMS, TEAMS

Rules:
- Recommend 5-10 specific photos based on the business type
- Prioritize missing categories first
- Be specific: not "take a photo of the exterior" but "Front entrance with signage clearly visible, shot during daylight"
- Return one per line in format: CATEGORY|priority|description
  - priority: high, medium, or low
- Nothing else — no headers`

  const userMessage = `Business: ${businessName}
Category: ${category || 'General'}
Services: ${services.join(', ') || 'Not specified'}
Existing photo categories: ${existingCategories.join(', ') || 'None'}
Total photos: ${totalPhotos}`

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') return []

  return block.text
    .trim()
    .split('\n')
    .map((line) => {
      const cleaned = line.replace(/^[-•*\d.]\s*/, '').trim()
      const parts = cleaned.split('|')
      if (parts.length < 3) return null
      const priority = parts[1].trim().toLowerCase()
      return {
        type: parts[0].trim(),
        description: parts.slice(2).join('|').trim(),
        priority: (priority === 'high' || priority === 'medium' || priority === 'low' ? priority : 'medium') as 'high' | 'medium' | 'low',
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.description.length > 0)
}

/**
 * Generate seasonal/holiday-aware post topics for a given month.
 * Returns structured topics with type, suggested date, and rationale.
 */
export async function generateSeasonalTopics({
  businessName,
  category,
  city,
  state,
  month,
  year,
}: {
  businessName: string
  category: string | null
  city: string | null
  state: string | null
  month: number // 1-12
  year: number
}): Promise<Array<{ topic: string; type: 'STANDARD' | 'EVENT' | 'OFFER'; suggested_date: string; rationale: string }>> {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const monthName = monthNames[month - 1]

  const systemPrompt = `You are a local business marketing expert creating seasonal Google Business Profile post topics.

Rules:
- Generate 3-5 post topics relevant to the business and the given month/location
- Include major holidays, seasonal events, and industry-specific occasions
- Each topic should work as a GBP post (update, event, or offer)
- Return JSON array with objects: { "topic": "Post topic/title", "type": "STANDARD|EVENT|OFFER", "suggested_date": "YYYY-MM-DD", "rationale": "Why this topic" }
- Only output the JSON array, nothing else
- Dates should fall within the specified month
- Be specific to the business type -- a dental office has different seasonal content than a restaurant`

  const userMessage = `Business: ${businessName}
Category: ${category || 'General business'}
Location: ${[city, state].filter(Boolean).join(', ') || 'US'}
Month: ${monthName} ${year}

Generate seasonal post topics for this business for ${monthName} ${year}.`

  const client = getClient()
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') return []

  try {
    const text = block.text.trim()
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (t: any) => t.topic && t.type && t.suggested_date && t.rationale
    )
  } catch {
    return []
  }
}
