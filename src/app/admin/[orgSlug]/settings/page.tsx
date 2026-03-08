import { requireAgencyAdmin } from '@/lib/locations'
import { OrgSettingsForm } from './settings-form'

export default async function OrgSettingsPage() {
  await requireAgencyAdmin()
  return <OrgSettingsForm />
}
