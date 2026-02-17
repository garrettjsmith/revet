import { NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAgentStream } from '@/lib/chat/stream'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: {
    messages?: unknown
    context?: Record<string, unknown>
    conversationId?: string
  }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { messages, context, conversationId } = body

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Messages required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Resolve user's org memberships and agency admin status
  const adminClient = createAdminClient()

  const { data: memberships } = await adminClient
    .from('org_members')
    .select('org_id, is_agency_admin')
    .eq('user_id', user.id)

  const orgIds = (memberships || []).map((m: any) => m.org_id)
  const isAgencyAdmin = (memberships || []).some((m: any) => m.is_agency_admin)

  // Resolve or create conversation
  let convId = conversationId
  if (!convId) {
    // Create a new conversation
    const orgId = context?.orgSlug
      ? await resolveOrgId(adminClient, context.orgSlug as string)
      : null

    const { data: conv } = await adminClient
      .from('chat_conversations')
      .insert({
        user_id: user.id,
        org_id: orgId,
        location_id: (context?.locationId as string) || null,
        title: truncate(getFirstUserMessage(messages), 100),
      })
      .select('id')
      .single()

    convId = conv?.id
  } else {
    // Update timestamp on existing conversation
    await adminClient
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', convId)
      .eq('user_id', user.id)
  }

  if (!convId) {
    return new Response(JSON.stringify({ error: 'Failed to create conversation' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Save the new user message
  const lastUserMsg = messages[messages.length - 1]
  if (lastUserMsg?.role === 'user') {
    await adminClient.from('chat_messages').insert({
      conversation_id: convId,
      role: 'user',
      content: lastUserMsg.content,
    })
  }

  // Build Claude messages from client history (last 20 turns)
  const recentMessages = messages.slice(-20).map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Create the agent stream
  const readable = createAgentStream(recentMessages, {
    supabase: adminClient,
    userId: user.id,
    orgIds,
    isAgencyAdmin,
    orgSlug: context?.orgSlug as string | undefined,
    orgName: context?.orgName as string | undefined,
    locationId: context?.locationId as string | undefined,
    locationName: context?.locationName as string | undefined,
    pathname: context?.pathname as string | undefined,
    conversationId: convId,
  })

  // Collect assistant text for persistence (tee the stream)
  const [streamForClient, streamForSave] = readable.tee()

  // Save assistant response in background
  saveAssistantMessage(streamForSave, adminClient, convId)

  return new Response(streamForClient, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/** Collect text deltas from a teed stream and save the final assistant message. */
async function saveAssistantMessage(
  stream: ReadableStream<Uint8Array>,
  supabase: any,
  conversationId: string
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      // Parse SSE lines
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'delta' && parsed.text) {
              text += parsed.text
            }
          } catch {
            // skip
          }
        }
      }
    }
  } catch {
    // Stream read error — save what we have
  }

  if (text) {
    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: text,
    })
  }
}

/** Resolve org slug to ID. */
async function resolveOrgId(supabase: any, slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .single()
  return data?.id || null
}

function getFirstUserMessage(messages: any[]): string {
  const first = messages.find((m: any) => m.role === 'user')
  return first?.content || 'New conversation'
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str
}
