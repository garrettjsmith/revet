import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

export interface LanderAIContent {
  local_context: string
  service_descriptions: Record<string, string>
  faq: Array<{ question: string; answer: string }>
  review_highlights: string | null
  directions_context: string | null
}

/**
 * Generate AI content for a local lander page.
 * Produces unique per-location content to avoid duplicate content across location pages.
 */
export async function generateLanderContent({
  businessName,
  category,
  address,
  city,
  state,
  locationType,
  description,
  services,
  reviewSummary,
  templateId,
  gbpAttributes,
  gbpServiceItems,
  reviewExcerpts,
}: {
  businessName: string
  category: string | null
  address: string | null
  city: string | null
  state: string | null
  locationType: string
  description: string | null
  services: string[]
  reviewSummary: { averageRating: number; reviewCount: number; themes: string[] } | null
  templateId: string
  gbpAttributes?: Array<{ name: string; values?: string[] }> | null
  gbpServiceItems?: Array<{ name: string; description?: string }> | null
  reviewExcerpts?: string[] | null
}): Promise<LanderAIContent> {
  const location = [city, state].filter(Boolean).join(', ')
  const isServiceArea = locationType === 'service_area'

  const systemPrompt = `You generate unique content for a local business landing page. Output valid JSON only — no markdown, no code fences, no explanation.

The JSON must have this exact shape:
{
  "local_context": "string (2-3 paragraphs about this location, using the address and local area to make it unique)",
  "service_descriptions": {"Service Name": "1-2 sentence description", ...},
  "faq": [{"question": "string", "answer": "string"}, ...],
  "review_highlights": "string or null",
  "directions_context": "string or null"
}

Rules:
- local_context: Write 2-3 short paragraphs about this specific location. Reference the city/neighborhood and how the business serves that community. Do NOT repeat the business name excessively. ${isServiceArea ? 'This is a service-area business — mention the areas served rather than a physical location.' : 'Mention the physical location and how to find it.'}
- service_descriptions: For each service provided, write a 1-2 sentence customer-facing description. Use the service names as keys exactly as given. If GBP service items are provided, incorporate their details.
- faq: Generate 4-6 frequently asked questions relevant to this type of business in this location. Include practical questions (hours, parking, appointments) and service-related ones. If business attributes are provided (accessibility, payment methods, etc.), work relevant ones into FAQ answers.
- review_highlights: If review excerpts are provided, write 2-3 sentences summarizing what customers appreciate, grounding your summary in the actual quotes. If only theme keywords are provided, use those. If no review data, set to null.
- directions_context: ${isServiceArea ? 'Set to null for service-area businesses.' : 'Write 2-3 sentences describing how to find this location. Mention the street, nearby landmarks or cross-streets if inferable from the address, and any relevant highways or neighborhoods. Make it practical and specific to help someone driving there for the first time.'} If no address is available, set to null.
- Never use emojis
- Write in third person, not first person
- Be factual and helpful, not promotional or salesy
- Keep language simple and direct`

  // Build user message with enriched data
  const parts: string[] = [
    `Generate landing page content for:`,
    `Business: ${businessName}`,
    `Category: ${category || 'General business'}`,
  ]
  if (address) parts.push(`Address: ${address}`)
  parts.push(`Location: ${location || 'Not specified'}`)
  parts.push(`Type: ${locationType}`)
  parts.push(`Template: ${templateId}`)
  if (description) parts.push(`Description: ${description}`)
  parts.push(`Services: ${services.length > 0 ? services.join(', ') : 'Not specified'}`)

  // GBP attributes (accessibility, payment methods, amenities)
  if (gbpAttributes && gbpAttributes.length > 0) {
    const attrLines = gbpAttributes
      .filter((a) => a.values && a.values.length > 0)
      .map((a) => `${a.name}: ${a.values!.join(', ')}`)
      .slice(0, 15)
    if (attrLines.length > 0) {
      parts.push(`Business attributes:\n${attrLines.join('\n')}`)
    }
  }

  // GBP service items (granular services listed on GBP)
  if (gbpServiceItems && gbpServiceItems.length > 0) {
    const svcLines = gbpServiceItems
      .map((s) => s.description ? `${s.name}: ${s.description}` : s.name)
      .slice(0, 20)
    parts.push(`GBP service items:\n${svcLines.join('\n')}`)
  }

  // Review data — prefer actual excerpts over themes
  if (reviewExcerpts && reviewExcerpts.length > 0) {
    parts.push(`Recent customer review excerpts:\n${reviewExcerpts.map((r) => `- "${r}"`).join('\n')}`)
    if (reviewSummary) {
      parts.push(`Overall: ${reviewSummary.averageRating.toFixed(1)} stars from ${reviewSummary.reviewCount} reviews`)
    }
  } else if (reviewSummary) {
    parts.push(`Reviews: ${reviewSummary.averageRating.toFixed(1)} stars from ${reviewSummary.reviewCount} reviews. Themes: ${reviewSummary.themes.length > 0 ? reviewSummary.themes.join(', ') : 'none identified'}`)
  } else {
    parts.push('Reviews: No review data available')
  }

  const userMessage = parts.join('\n')

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  const raw = JSON.parse(block.text.trim()) as Record<string, unknown>

  // Validate structure
  if (typeof raw.local_context !== 'string' || !Array.isArray(raw.faq)) {
    throw new Error('AI returned invalid content structure')
  }

  const parsed: LanderAIContent = {
    local_context: raw.local_context,
    service_descriptions: (raw.service_descriptions || {}) as Record<string, string>,
    faq: raw.faq as Array<{ question: string; answer: string }>,
    review_highlights: (raw.review_highlights as string) || null,
    directions_context: (raw.directions_context as string) || null,
  }

  return parsed
}
