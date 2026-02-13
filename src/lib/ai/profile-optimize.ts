import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

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
    model: 'claude-3-5-haiku-latest',
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
    model: 'claude-3-5-haiku-latest',
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
