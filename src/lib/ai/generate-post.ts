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
  topic,
  brandVoice,
}: {
  businessName: string
  businessDescription: string | null
  city: string | null
  state: string | null
  categories: string[]
  recentPostSummaries: string[]
  topic?: string
  brandVoice?: string | null
}): Promise<{ summary: string; headline: string }> {
  const location = [city, state].filter(Boolean).join(', ')
  const categoryList = categories.length > 0 ? categories.join(', ') : 'local business'
  const recentContext = recentPostSummaries.length > 0
    ? `\n\nRecent posts (avoid repeating these topics):\n${recentPostSummaries.map((s) => `- ${s}`).join('\n')}`
    : ''
  const topicDirective = topic
    ? `\n- Write about this specific topic: "${topic}"`
    : '\n- Topic: a helpful tip, seasonal update, service highlight, or community message relevant to the business type and location'
  const voiceDirective = brandVoice
    ? `\n- Brand voice: ${brandVoice}`
    : ''

  const systemPrompt = `You write Google Business Profile posts for "${businessName}", a ${categoryList} in ${location || 'the local area'}.${
    businessDescription ? ` About the business: ${businessDescription}` : ''
  }

Rules:
- Write a single post (1-3 sentences, under 300 characters)${topicDirective}${voiceDirective}
- Tone: professional, warm, and local
- Never use emojis
- Never use hashtags
- Never mention competitors
- Never include URLs or phone numbers (those are added separately)
- Make it feel natural, not promotional

Respond in this exact format (two lines only):
HEADLINE: A short 2-4 word headline in title case
POST: The post body text${recentContext}`

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: topic ? `Write a Google Business Profile post about: ${topic}` : 'Write the next Google Business Profile post.' }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  const text = block.text.trim()

  // Parse HEADLINE: / POST: format
  const headlineMatch = text.match(/HEADLINE:\s*(.+)/i)
  const postMatch = text.match(/POST:\s*(.+)/i)

  if (headlineMatch && postMatch) {
    return {
      headline: headlineMatch[1].trim(),
      summary: postMatch[1].trim(),
    }
  }

  // Fallback: use first few words as headline, full text as summary
  const words = text.split(/\s+/)
  return {
    headline: words.slice(0, 3).join(' '),
    summary: text,
  }
}
