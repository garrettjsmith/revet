import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabase } from '@/lib/supabase/server'

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

/**
 * GET /api/intake/keywords?category=Dentist&city=Austin&state=TX
 *
 * Returns pre-seeded keyword suggestions for a business category + location.
 * Authenticated endpoint — requires user session.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const city = searchParams.get('city') || ''
  const state = searchParams.get('state') || ''

  if (!category) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 })
  }

  const location = [city, state].filter(Boolean).join(', ')

  try {
    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are a local SEO keyword expert. Generate search keywords that customers would use to find this type of business.

Rules:
- Return 15-20 keywords, one per line
- Include a mix of: service keywords, "[service] near me" variants, "[service] in [city]" variants, and long-tail keywords
- Focus on high-intent local search queries
- No numbering, no bullets, just the keyword phrase per line
- Lowercase only`,
      messages: [{
        role: 'user',
        content: `Generate local SEO keywords for:\nCategory: ${category}\nLocation: ${location || 'general'}`,
      }],
    })

    const block = response.content[0]
    if (block.type !== 'text') {
      return NextResponse.json({ keywords: [] })
    }

    const keywords = block.text
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.length < 100)

    return NextResponse.json({ keywords })
  } catch (err) {
    console.error('[intake/keywords] AI generation failed:', err)
    return NextResponse.json({ keywords: [] })
  }
}
