import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getToolDefinitions, executeTool } from './tools'
import { buildSystemPrompt } from './system-prompt'

const MAX_TOOL_ROUNDS = 10

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

interface StreamContext {
  supabase: SupabaseClient
  userId: string
  orgIds: string[]
  isAgencyAdmin: boolean
  orgSlug?: string
  orgName?: string
  locationId?: string
  locationName?: string
  pathname?: string
  conversationId: string
}

/**
 * Run the Ask Rev agent loop and return a ReadableStream of SSE events.
 *
 * The loop:
 * 1. Send messages + tools to Claude
 * 2. Stream text deltas to the client
 * 3. If Claude calls tools, execute them server-side
 * 4. Feed results back and repeat (up to MAX_TOOL_ROUNDS)
 */
export function createAgentStream(
  messages: Anthropic.MessageParam[],
  ctx: StreamContext
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const tools = getToolDefinitions(ctx.isAgencyAdmin)
  const systemPrompt = buildSystemPrompt({
    orgSlug: ctx.orgSlug,
    orgName: ctx.orgName,
    locationId: ctx.locationId,
    locationName: ctx.locationName,
    pathname: ctx.pathname,
    isAgencyAdmin: ctx.isAgencyAdmin,
  })

  const model = process.env.FALCON_AGENT_MODEL || 'claude-sonnet-4-5-20250929'
  const toolCtx = {
    supabase: ctx.supabase,
    userId: ctx.userId,
    orgIds: ctx.orgIds,
    isAgencyAdmin: ctx.isAgencyAdmin,
  }

  return new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Send conversation ID so client can track it
        send({ type: 'meta', conversationId: ctx.conversationId })

        let currentMessages = [...messages]

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const stream = getClient().messages.stream({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            tools,
            messages: currentMessages,
          })

          // Stream text deltas to client
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              send({ type: 'delta', text: event.delta.text })
            }
          }

          const finalMessage = await stream.finalMessage()

          // Check for tool calls
          const toolUseBlocks = finalMessage.content.filter(
            (b: Anthropic.ContentBlock): b is Anthropic.ContentBlock & { type: 'tool_use' } => b.type === 'tool_use'
          )

          if (finalMessage.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
            // Done — no more tool calls
            break
          }

          // Add assistant message with all content blocks
          currentMessages.push({ role: 'assistant', content: finalMessage.content })

          // Execute each tool
          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const toolBlock of toolUseBlocks) {
            send({ type: 'tool_start', tool: toolBlock.name })

            try {
              const result = await executeTool(
                toolBlock.name,
                toolBlock.input as Record<string, unknown>,
                toolCtx
              )

              // Save tool call + result for audit
              await saveToolAudit(ctx.supabase, ctx.conversationId, toolBlock.name, toolBlock.input, result)

              send({ type: 'tool_done', tool: toolBlock.name })

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: JSON.stringify(result),
              })
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : 'Tool execution failed'
              send({ type: 'tool_done', tool: toolBlock.name })

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: JSON.stringify({ error: errorMsg }),
                is_error: true,
              })
            }
          }

          // Add tool results and continue the loop
          currentMessages.push({ role: 'user', content: toolResults })
        }

        send({ type: 'done' })
        controller.close()
      } catch (error) {
        console.error('[Ask Rev] Stream error:', error)
        send({ type: 'error', text: 'Something went wrong. Please try again.' })
        controller.close()
      }
    },
  })
}

/** Save tool call + result to chat_messages for audit trail. */
async function saveToolAudit(
  supabase: SupabaseClient,
  conversationId: string,
  toolName: string,
  toolInput: unknown,
  toolResult: unknown
) {
  // Insert tool_call and tool_result as separate messages
  await supabase.from('chat_messages').insert([
    {
      conversation_id: conversationId,
      role: 'tool_call',
      tool_name: toolName,
      tool_input: toolInput,
    },
    {
      conversation_id: conversationId,
      role: 'tool_result',
      tool_name: toolName,
      tool_result: toolResult,
    },
  ])
}
