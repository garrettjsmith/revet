import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { verifyCronSecret } from '@/lib/cron-auth'

export const maxDuration = 120

let _client: Anthropic | null = null
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

/**
 * GET /api/cron/correction-analysis
 *
 * Weekly cron that analyzes patterns in AI corrections to identify
 * common issues and log improvement suggestions to agent_activity_log.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const adminClient = createAdminClient()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: corrections } = await adminClient
    .from('ai_corrections')
    .select('id, org_id, field, original_text, corrected_text, created_at')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })

  if (!corrections || corrections.length < 3) {
    return NextResponse.json({ processed: 0, message: 'Not enough corrections for analysis' })
  }

  // Group by field
  const byField = new Map<string, typeof corrections>()
  for (const c of corrections) {
    const existing = byField.get(c.field) || []
    existing.push(c)
    byField.set(c.field, existing)
  }

  const insights: Array<{ field: string; count: number; patterns: string }> = []

  for (const [field, fieldCorrections] of Array.from(byField)) {
    if (fieldCorrections.length < 2) continue

    // Take up to 10 examples for analysis
    const examples = fieldCorrections.slice(0, 10).map((c) => ({
      original: c.original_text.slice(0, 200),
      corrected: c.corrected_text.slice(0, 200),
    }))

    try {
      const response = await getClient().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: `You analyze patterns in AI text corrections to identify systematic issues.
Given pairs of original AI output and human corrections, identify:
1. Common types of changes (tone, length, specificity, etc.)
2. Recurring mistakes to avoid
3. Brief actionable suggestions for improving the AI prompts

Be concise. Return 2-4 bullet points, nothing else.`,
        messages: [{
          role: 'user',
          content: `Field: ${field}\nCorrections (${fieldCorrections.length} total, showing ${examples.length}):\n${examples.map((e, i) => `${i + 1}. Original: "${e.original}"\n   Corrected: "${e.corrected}"`).join('\n\n')}`,
        }],
      })

      const block = response.content[0]
      if (block.type === 'text') {
        insights.push({
          field,
          count: fieldCorrections.length,
          patterns: block.text.trim(),
        })
      }
    } catch (err) {
      console.error(`[correction-analysis] Failed for field ${field}:`, err)
    }
  }

  // Log insights to agent_activity_log
  for (const insight of insights) {
    const recentCorrection = byField.get(insight.field)?.[0]
    if (!recentCorrection) continue

    // Get a representative location for this org
    const { data: loc } = await adminClient
      .from('locations')
      .select('id')
      .eq('org_id', recentCorrection.org_id)
      .limit(1)
      .single()

    if (loc) {
      await adminClient.from('agent_activity_log').insert({
        location_id: loc.id,
        action_type: 'correction_pattern',
        status: 'completed',
        summary: `${insight.field}: ${insight.count} corrections analyzed. Patterns identified.`,
        details: {
          field: insight.field,
          correction_count: insight.count,
          patterns: insight.patterns,
          period: '30d',
        },
      })
    }
  }

  return NextResponse.json({
    processed: corrections.length,
    fields_analyzed: insights.length,
    insights: insights.map((i) => ({ field: i.field, count: i.count, patterns: i.patterns })),
  })
}
