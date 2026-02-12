import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || '')
  }
  return _resend
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@use.revet.app'
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Revet'

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
 * Build an HTML email for a new review alert.
 */
export function buildReviewAlertEmail({
  locationName,
  platform,
  reviewerName,
  rating,
  body,
  publishedAt,
  alertType,
}: {
  locationName: string
  platform: string
  reviewerName: string | null
  rating: number | null
  body: string | null
  publishedAt: string
  alertType: string
}) {
  const stars = rating
    ? Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < rating ? '#FBBF24' : '#D5CFC5'};font-size:18px;">★</span>`
      ).join('')
    : ''

  const escaped = (body || 'No review text').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const isNegative = alertType === 'negative_review'

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border:1px solid ${isNegative ? '#fca5a5' : '#e8e4dc'};border-radius:12px;overflow:hidden;">
      <div style="background:${isNegative ? '#991b1b' : '#1a1a1a'};padding:20px 24px;">
        <h1 style="margin:0;color:#FAF8F5;font-size:16px;font-weight:600;">
          ${isNegative ? 'Negative Review Alert' : 'New Review'}
        </h1>
        <p style="margin:4px 0 0;color:#9b9590;font-size:12px;">${locationName} · ${platform}</p>
      </div>
      <div style="padding:20px 24px;">
        <div style="margin-bottom:12px;">
          ${stars}
        </div>
        <p style="margin:0 0 8px;color:#6b6560;font-size:13px;font-weight:500;">
          ${reviewerName || 'Anonymous'}
        </p>
        <p style="margin:0 0 16px;color:#1a1a1a;font-size:14px;line-height:1.6;">
          &ldquo;${escaped}&rdquo;
        </p>
        <p style="margin:0;color:#9b9590;font-size:11px;">
          Posted ${publishedAt}
        </p>
      </div>
    </div>
    <p style="text-align:center;margin:16px 0 0;color:#c4bfb8;font-size:10px;">
      Sent by revet.app
    </p>
  </div>
</body>
</html>`
}

/**
 * Build an HTML email for a review response alert (reply posted to a review).
 */
export function buildReviewResponseEmail({
  locationName,
  platform,
  reviewerName,
  rating,
  reviewBody,
  replyBody,
  repliedAt,
}: {
  locationName: string
  platform: string
  reviewerName: string | null
  rating: number | null
  reviewBody: string | null
  replyBody: string
  repliedAt: string
}) {
  const stars = rating
    ? Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < rating ? '#FBBF24' : '#D5CFC5'};font-size:18px;">&#9733;</span>`
      ).join('')
    : ''

  const escapedReview = (reviewBody || 'No review text').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const escapedReply = replyBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border:1px solid #e8e4dc;border-radius:12px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:20px 24px;">
        <h1 style="margin:0;color:#FAF8F5;font-size:16px;font-weight:600;">Response Posted</h1>
        <p style="margin:4px 0 0;color:#9b9590;font-size:12px;">${locationName} &middot; ${platform}</p>
      </div>
      <div style="padding:20px 24px;">
        <div style="margin-bottom:12px;">
          ${stars}
        </div>
        <p style="margin:0 0 8px;color:#6b6560;font-size:13px;font-weight:500;">
          ${reviewerName || 'Anonymous'}
        </p>
        <p style="margin:0 0 16px;color:#1a1a1a;font-size:14px;line-height:1.6;">
          &ldquo;${escapedReview}&rdquo;
        </p>
        <div style="border-top:1px solid #e8e4dc;padding-top:16px;">
          <p style="margin:0 0 8px;color:#6b6560;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
            Your Reply
          </p>
          <p style="margin:0 0 8px;color:#1a1a1a;font-size:14px;line-height:1.6;">
            ${escapedReply}
          </p>
          <p style="margin:0;color:#9b9590;font-size:11px;">
            Replied ${repliedAt}
          </p>
        </div>
      </div>
    </div>
    <p style="text-align:center;margin:16px 0 0;color:#c4bfb8;font-size:10px;">
      Sent by revet.app
    </p>
  </div>
</body>
</html>`
}

/**
 * Build an HTML email for negative review funnel feedback.
 */
export function buildFeedbackEmail({
  profileName,
  managerName,
  rating,
  feedback,
}: {
  profileName: string
  managerName: string
  rating: number | null
  feedback: string | null
}) {
  const stars = rating
    ? Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < rating ? '#FBBF24' : '#D5CFC5'};font-size:18px;">★</span>`
      ).join('')
    : ''

  const escapedFeedback = (feedback || 'No feedback provided').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <p style="margin:0 0 4px;font-size:14px;font-weight:600;">${profileName}</p>
    ${stars ? `<p style="margin:0 0 16px;font-size:18px;line-height:1;">${stars}</p>` : ''}
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151;">
      ${escapedFeedback}
    </p>
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      This feedback was submitted through your review page.
    </p>
  </div>
</body>
</html>`
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
      Sent by revet.app
    </p>
  </div>
</body>
</html>`
}

/**
 * Build an HTML email for the daily review digest.
 */
export function buildReviewDigestEmail({
  orgName,
  date,
  totalReviews,
  avgRating,
  positiveCount,
  neutralCount,
  negativeCount,
  locations,
  needsAttention,
}: {
  orgName: string
  date: string
  totalReviews: number
  avgRating: number | null
  positiveCount: number
  neutralCount: number
  negativeCount: number
  locations: { name: string; reviewCount: number; avgRating: number | null }[]
  needsAttention: { locationName: string; reviewerName: string | null; rating: number | null; body: string | null; publishedAt: string }[]
}) {
  const avgStars = avgRating
    ? Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < Math.round(avgRating) ? '#FBBF24' : '#D5CFC5'};font-size:20px;">&#9733;</span>`
      ).join('')
    : ''

  const locationRows = locations.length > 1
    ? locations.map((loc) => {
        const locAvg = loc.avgRating ? loc.avgRating.toFixed(1) : '--'
        return `
          <tr>
            <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${loc.name}</td>
            <td style="padding:6px 0;color:#6b6560;font-size:14px;text-align:right;">${loc.reviewCount} review${loc.reviewCount === 1 ? '' : 's'}</td>
            <td style="padding:6px 0;color:#6b6560;font-size:14px;text-align:right;padding-left:16px;">${locAvg} avg</td>
          </tr>`
      }).join('')
    : ''

  const attentionItems = needsAttention.slice(0, 5).map((r) => {
    const stars = r.rating
      ? Array.from({ length: 5 }, (_, i) =>
          `<span style="color:${i < r.rating! ? '#FBBF24' : '#D5CFC5'};font-size:14px;">&#9733;</span>`
        ).join('')
      : ''
    const escaped = (r.body || 'No review text').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const snippet = escaped.length > 120 ? escaped.slice(0, 120) + '...' : escaped
    return `
      <div style="padding:12px 0;border-bottom:1px solid #e8e4dc;">
        <div>${stars}</div>
        <p style="margin:4px 0;color:#1a1a1a;font-size:13px;line-height:1.5;">&ldquo;${snippet}&rdquo;</p>
        <p style="margin:0;color:#9b9590;font-size:11px;">${r.reviewerName || 'Anonymous'} &middot; ${r.locationName} &middot; ${r.publishedAt}</p>
      </div>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border:1px solid #e8e4dc;border-radius:12px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:20px 24px;">
        <h1 style="margin:0;color:#FAF8F5;font-size:16px;font-weight:600;">Daily Review Summary</h1>
        <p style="margin:4px 0 0;color:#9b9590;font-size:12px;">${orgName} &middot; ${date}</p>
      </div>
      <div style="padding:20px 24px;">
        <div style="text-align:center;padding:16px 0 20px;">
          <p style="margin:0;font-size:36px;font-weight:700;color:#1a1a1a;">${totalReviews}</p>
          <p style="margin:2px 0 12px;color:#6b6560;font-size:14px;">new review${totalReviews === 1 ? '' : 's'} yesterday</p>
          ${avgStars ? `<div>${avgStars} <span style="color:#6b6560;font-size:14px;">${avgRating!.toFixed(1)}</span></div>` : ''}
        </div>
        <div style="display:flex;justify-content:center;gap:24px;padding:12px 0;border-top:1px solid #e8e4dc;border-bottom:1px solid #e8e4dc;">
          <div style="text-align:center;">
            <p style="margin:0;font-size:20px;font-weight:600;color:#16a34a;">${positiveCount}</p>
            <p style="margin:2px 0 0;color:#6b6560;font-size:11px;">positive</p>
          </div>
          <div style="text-align:center;">
            <p style="margin:0;font-size:20px;font-weight:600;color:#9b9590;">${neutralCount}</p>
            <p style="margin:2px 0 0;color:#6b6560;font-size:11px;">neutral</p>
          </div>
          <div style="text-align:center;">
            <p style="margin:0;font-size:20px;font-weight:600;color:#dc2626;">${negativeCount}</p>
            <p style="margin:2px 0 0;color:#6b6560;font-size:11px;">negative</p>
          </div>
        </div>
        ${locationRows ? `
        <div style="padding:16px 0 0;">
          <p style="margin:0 0 8px;color:#6b6560;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">By Location</p>
          <table style="width:100%;border-collapse:collapse;">${locationRows}</table>
        </div>` : ''}
        ${attentionItems ? `
        <div style="padding:16px 0 0;">
          <p style="margin:0 0 4px;color:#dc2626;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Needs Attention</p>
          ${attentionItems}
        </div>` : ''}
      </div>
    </div>
    <p style="text-align:center;margin:16px 0 0;color:#c4bfb8;font-size:10px;">
      Sent by revet.app
    </p>
  </div>
</body>
</html>`
}
