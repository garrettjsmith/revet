import { NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

function buildSystemPrompt(context: {
  orgSlug?: string
  orgName?: string
  locationId?: string
  locationName?: string
  pathname?: string
  isAgencyAdmin?: boolean
}) {
  const parts = [
    'You are an AI assistant for Revet, a search optimization platform for multi-location businesses.',
    'You help users understand their data, answer questions about locations, reviews, and performance, and provide actionable insights.',
    'Keep responses concise and helpful. Use short paragraphs.',
  ]

  if (context.orgName) {
    parts.push(`The user is viewing organization: "${context.orgName}".`)
  }
  if (context.locationName) {
    parts.push(`They are looking at location: "${context.locationName}".`)
  }
  if (context.pathname) {
    parts.push(`Current page: ${context.pathname}`)
  }
  if (context.isAgencyAdmin) {
    parts.push('This user is an agency admin with full platform access.')
  } else {
    parts.push('This user is a customer org member with read-only dashboard access.')
  }

  parts.push(
    "You don't have direct access to their data yet — this is a preview of the chat interface.",
    "When asked about data you don't have, explain what you'll be able to help with once connected: review trends, location comparisons, performance metrics, content generation, and more.",
    "Be helpful and specific about what's coming, but don't make up data."
  )

  return parts.join(' ')
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { messages?: unknown; context?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { messages, context } = body

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Messages required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Keep last 20 messages to limit context
  const recentMessages = messages.slice(-20)
  const systemPrompt = buildSystemPrompt((context as Record<string, string | boolean | undefined>) || {})

  try {
    const stream = getClient().messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: recentMessages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const data = JSON.stringify({ type: 'delta', text: event.delta.text })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('Chat stream error:', error)
          const data = JSON.stringify({ type: 'error', text: 'Stream interrupted' })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(JSON.stringify({ error: 'Chat request failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
