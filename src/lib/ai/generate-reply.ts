import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

/**
 * Generate a review reply using Claude 3.5 Haiku.
 */
export async function generateReviewReply({
  businessName,
  businessContext,
  reviewerName,
  rating,
  reviewBody,
  tone,
}: {
  businessName: string
  businessContext?: string | null
  reviewerName: string | null
  rating: number | null
  reviewBody: string | null
  tone?: string
}): Promise<string> {
  const systemPrompt = `You write review replies on behalf of "${businessName}".${
    businessContext ? ` About the business: ${businessContext}` : ''
  }

Rules:
- Tone: ${tone || 'professional and friendly'}
- Keep it concise: 2-4 sentences
- Never use emojis
- If the review is positive, thank them genuinely and reference something specific they mentioned
- If the review is negative, acknowledge their concern, apologize sincerely, and invite them to contact the business directly to resolve it
- If the review is neutral, thank them and address any specific feedback
- Never offer discounts, refunds, or make specific promises
- Never be defensive or argumentative
- Use the reviewer's first name if available
- Do not include a greeting like "Dear" — start naturally`

  const ratingLabel = rating ? `${rating}/5 stars` : 'no rating'
  const userMessage = `Review from ${reviewerName || 'Anonymous'} (${ratingLabel}):\n${reviewBody || '(no text)'}`

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

  return block.text.trim()
}
