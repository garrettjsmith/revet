import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildFormSubmissionEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { form_id, data } = body

    if (!form_id || !data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch the form template to validate and get alert settings
    const { data: form, error: formError } = await supabase
      .from('form_templates')
      .select('*')
      .eq('id', form_id)
      .eq('active', true)
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // Validate required fields
    const fields = (form.fields || []) as { id: string; label: string; type: string; required?: boolean }[]
    for (const field of fields) {
      if (field.required && !data[field.id]?.trim()) {
        return NextResponse.json(
          { error: `${field.label} is required` },
          { status: 400 }
        )
      }
    }

    // Build metadata from request
    const metadata: Record<string, string> = {}
    const ua = request.headers.get('user-agent')
    if (ua) metadata.user_agent = ua
    const referer = request.headers.get('referer')
    if (referer) metadata.referer = referer

    // Insert submission
    const { error: insertError } = await supabase
      .from('form_submissions')
      .insert({
        form_id,
        data,
        metadata,
      })

    if (insertError) {
      console.error('[form-submissions] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
    }

    // Send email alert (non-blocking — don't fail the request)
    if (form.alert_enabled && form.alert_email) {
      const now = new Date()
      const submittedAt = now.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })

      sendEmail({
        to: form.alert_email,
        subject: `New submission: ${form.name}`,
        html: buildFormSubmissionEmail({
          formName: form.name,
          fields,
          data,
          submittedAt,
        }),
      }).catch((err) => {
        console.error('[form-submissions] Email alert failed:', err)
      })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
