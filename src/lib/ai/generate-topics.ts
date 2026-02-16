import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

/**
 * Generate a pool of post topic ideas for a location using Claude.
 * Returns an array of short topic strings (e.g., "spring patio maintenance tips").
 */
export async function generateTopicPool({
  businessName,
  businessDescription,
  city,
  state,
  categories,
  brandVoice,
  existingTopics,
  count,
}: {
  businessName: string
  businessDescription: string | null
  city: string | null
  state: string | null
  categories: string[]
  brandVoice: string | null
  existingTopics: string[]
  count: number
}): Promise<string[]> {
  const location = [city, state].filter(Boolean).join(', ')
  const categoryList = categories.length > 0 ? categories.join(', ') : 'local business'

  const existingContext = existingTopics.length > 0
    ? `\n\nExisting topics (do NOT repeat these):\n${existingTopics.map((t) => `- ${t}`).join('\n')}`
    : ''

  const systemPrompt = `You generate Google Business Profile post topic ideas for "${businessName}", a ${categoryList} in ${location || 'the local area'}.${
    businessDescription ? ` About the business: ${businessDescription}` : ''
  }${brandVoice ? ` Brand voice: ${brandVoice}` : ''}

Rules:
- Generate exactly ${count} unique topic ideas
- Each topic is a short phrase (3-8 words), lowercase
- Topics should cover: seasonal relevance, service highlights, tips/education, community connection, promotions, behind-the-scenes, customer success themes
- Vary widely — mix practical tips, seasonal hooks, service spotlights, and community angles
- Make topics specific to the business type and location when possible
- Never repeat existing topics
- Return ONLY the topics, one per line, no numbering, no bullets, no extra text${existingContext}`

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Generate ${count} post topic ideas.` }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return block.text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 200)
    .slice(0, count)
}
