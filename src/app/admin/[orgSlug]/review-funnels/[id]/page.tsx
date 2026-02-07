import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function EditReviewFunnelRedirect({ params }: { params: { orgSlug: string } }) {
  redirect(`/admin/${params.orgSlug}/locations`)
}
