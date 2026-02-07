import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || '')
  }
  return _resend
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'notifications@lseo.app'
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'LSEO'

interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email send')
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const { data, error } = await getResend().emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    })

    if (error) {
      console.error('[email] Resend error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('[email] Failed to send:', err)
    return { success: false, error: 'Failed to send email' }
  }
}

/**
 * Build an HTML email for a new form submission alert.
 */
export function buildFormSubmissionEmail({
  formName,
  fields,
  data,
  submittedAt,
}: {
  formName: string
  fields: { id: string; label: string; type: string }[]
  data: Record<string, string>
  submittedAt: string
}) {
  const rows = fields
    .map((f) => {
      const value = data[f.id] || '—'
      const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e8e4dc;color:#6b6560;font-size:13px;white-space:nowrap;vertical-align:top;">${f.label}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8e4dc;color:#1a1a1a;font-size:13px;">${escaped}</td>
        </tr>`
    })
    .join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border:1px solid #e8e4dc;border-radius:12px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:20px 24px;">
        <h1 style="margin:0;color:#FAF8F5;font-size:16px;font-weight:600;">New Form Submission</h1>
        <p style="margin:4px 0 0;color:#9b9590;font-size:12px;">${formName}</p>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;">
          ${rows}
        </table>
        <p style="margin:16px 0 0;color:#9b9590;font-size:11px;">
          Submitted ${submittedAt}
        </p>
      </div>
    </div>
    <p style="text-align:center;margin:16px 0 0;color:#c4bfb8;font-size:10px;">
      Sent by lseo.app
    </p>
  </div>
</body>
</html>`
}
