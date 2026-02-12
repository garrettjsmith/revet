import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

/**
 * Generate a Google Business Profile post using Claude.
 */
export async function generateGBPPost({
  businessName,
  businessDescription,
  city,
  state,
  categories,
  recentPostSummaries,
}: {
  businessName: string
  businessDescription: string | null
  city: string | null
  state: string | null
  categories: string[]
  recentPostSummaries: string[]
}): Promise<string> {
  const location = [city, state].filter(Boolean).join(', ')
  const categoryList = categories.length > 0 ? categories.join(', ') : 'local business'
  const recentContext = recentPostSummaries.length > 0
    ? `\n\nRecent posts (avoid repeating these topics):\n${recentPostSummaries.map((s) => `- ${s}`).join('\n')}`
    : ''

  const systemPrompt = `You write Google Business Profile posts for "${businessName}", a ${categoryList} in ${location || 'the local area'}.${
    businessDescription ? ` About the business: ${businessDescription}` : ''
  }

Rules:
- Write a single post (1-3 sentences, under 300 characters)
- Topic: a helpful tip, seasonal update, service highlight, or community message relevant to the business type and location
- Tone: professional, warm, and local
- Never use emojis
- Never use hashtags
- Never mention competitors
- Never include URLs or phone numbers (those are added separately)
- Make it feel natural, not promotional
- Vary the format — sometimes a tip, sometimes a seasonal note, sometimes a service spotlight${recentContext}`

  const response = await getClient().messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 200,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Write the next Google Business Profile post.' }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return block.text.trim()
}
