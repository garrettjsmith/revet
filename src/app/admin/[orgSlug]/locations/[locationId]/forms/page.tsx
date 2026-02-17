import { redirect } from 'next/navigation'

export default function LocationFormsPage({
  params,
}: {
  params: { orgSlug: string; locationId: string }
}) {
  redirect(`/admin/${params.orgSlug}/forms?location=${params.locationId}`)
}
