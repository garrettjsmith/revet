import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ReviewFunnelsRedirect({ params }: { params: { orgSlug: string } }) {
  redirect(`/admin/${params.orgSlug}/locations`)
}
