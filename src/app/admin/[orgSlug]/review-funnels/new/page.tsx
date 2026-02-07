import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function NewReviewFunnelRedirect({ params }: { params: { orgSlug: string } }) {
  redirect(`/admin/${params.orgSlug}/locations`)
}
