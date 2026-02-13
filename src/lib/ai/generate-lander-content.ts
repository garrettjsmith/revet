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
}): Promise<LanderAIContent> {
  const location = [city, state].filter(Boolean).join(', ')
  const isServiceArea = locationType === 'service_area'

  const systemPrompt = `You generate unique content for a local business landing page. Output valid JSON only — no markdown, no code fences, no explanation.

The JSON must have this exact shape:
{
  "local_context": "string (2-3 paragraphs about this location, using the address and local area to make it unique)",
  "service_descriptions": {"Service Name": "1-2 sentence description", ...},
  "faq": [{"question": "string", "answer": "string"}, ...],
  "review_highlights": "string or null"
}

Rules:
- local_context: Write 2-3 short paragraphs about this specific location. Reference the city/neighborhood and how the business serves that community. Do NOT repeat the business name excessively. ${isServiceArea ? 'This is a service-area business — mention the areas served rather than a physical location.' : 'Mention the physical location and how to find it.'}
- service_descriptions: For each service provided, write a 1-2 sentence customer-facing description. Use the service names as keys exactly as given.
- faq: Generate 4-6 frequently asked questions relevant to this type of business in this location. Include practical questions (hours, parking, appointments) and service-related ones.
- review_highlights: If review data is provided, write 1-2 sentences summarizing what customers appreciate. If no review data, set to null.
- Never use emojis
- Write in third person, not first person
- Be factual and helpful, not promotional or salesy
- Keep language simple and direct`

  const userMessage = `Generate landing page content for:
Business: ${businessName}
Category: ${category || 'General business'}
${address ? `Address: ${address}` : ''}
Location: ${location || 'Not specified'}
Type: ${locationType}
Template: ${templateId}
${description ? `Description: ${description}` : ''}
Services: ${services.length > 0 ? services.join(', ') : 'Not specified'}
${reviewSummary ? `Reviews: ${reviewSummary.averageRating.toFixed(1)} stars from ${reviewSummary.reviewCount} reviews. Themes: ${reviewSummary.themes.length > 0 ? reviewSummary.themes.join(', ') : 'none identified'}` : 'Reviews: No review data available'}`

  const response = await getClient().messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  const parsed = JSON.parse(block.text.trim()) as LanderAIContent

  // Validate structure
  if (typeof parsed.local_context !== 'string' || !Array.isArray(parsed.faq)) {
    throw new Error('AI returned invalid content structure')
  }

  return parsed
}
