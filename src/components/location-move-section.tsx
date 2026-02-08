'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Organization } from '@/lib/types'

interface Props {
  locationId: string
  locationName: string
  currentOrgId: string
  currentOrgName: string
  isAgencyAdmin: boolean
}

export function LocationMoveSection({
  locationId,
  locationName,
  currentOrgId,
  currentOrgName,
  isAgencyAdmin,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [showMoveUI, setShowMoveUI] = useState(false)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (showMoveUI && organizations.length === 0) {
      loadOrganizations()
    }
  }, [showMoveUI])

  const loadOrganizations = async () => {
    // Get all orgs for agency admin
    const { data: memberships } = await supabase
      .from('org_members')
      .select('org_id, organizations(id, name, slug)')
      .eq('is_agency_admin', true)

    if (memberships) {
      // Extract unique orgs (agency admin sees all orgs across all memberships)
      const orgMap = new Map<string, Organization>()
      memberships.forEach((m: any) => {
        const org = m.organizations
        if (org && org.id !== currentOrgId) {
          orgMap.set(org.id, org)
        }
      })
      setOrganizations(Array.from(orgMap.values()))
    }
  }

  const handleOrgSelect = (orgId: string) => {
    setSelectedOrgId(orgId)
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/locations/${locationId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: selectedOrgId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to move location')
      }

      // Redirect to the new org's location settings
      router.push(`/admin/${data.new_org_slug}/locations/${locationId}/settings`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move location')
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setShowConfirm(false)
    setSelectedOrgId('')
    setShowMoveUI(false)
  }

  if (!isAgencyAdmin) return null

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId)

  const labelClass = 'block text-[11px] text-warm-gray uppercase tracking-wider mb-1.5'
  const buttonClass =
    'px-4 py-2 border border-warm-border text-warm-gray text-sm rounded-lg hover:text-ink hover:border-ink transition-colors'
  const primaryButtonClass =
    'px-6 py-2.5 bg-ink hover:bg-ink/90 text-cream text-sm font-medium rounded-full transition-colors disabled:opacity-50'
  const secondaryButtonClass =
    'px-6 py-2.5 border border-warm-border text-warm-gray text-sm rounded-full hover:text-ink hover:border-ink transition-colors'

  return (
    <div className="border border-warm-border rounded-xl p-6 space-y-4 mb-6">
      <h2 className="text-xl font-serif text-ink">Organization</h2>

      <div>
        <label className={labelClass}>Currently in</label>
        <div className="text-sm text-ink mb-3">{currentOrgName}</div>

        {!showMoveUI && !showConfirm && (
          <button
            type="button"
            onClick={() => setShowMoveUI(true)}
            className={buttonClass}
          >
            Move to another organization...
          </button>
        )}

        {showMoveUI && !showConfirm && (
          <div className="space-y-3">
            <label className={labelClass}>Select target organization</label>
            <select
              value={selectedOrgId}
              onChange={(e) => handleOrgSelect(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-cream border border-warm-border rounded-lg text-sm text-ink outline-none focus:ring-2 focus:ring-warm-gray transition-colors"
            >
              <option value="">-- Select an organization --</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-warm-gray hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {showConfirm && selectedOrg && (
          <div className="space-y-4 p-4 bg-cream border border-warm-border rounded-lg">
            <div className="text-sm text-ink">
              <strong>Confirm move:</strong>
            </div>
            <div className="text-sm text-warm-gray">
              Move <strong className="text-ink">{locationName}</strong> to{' '}
              <strong className="text-ink">{selectedOrg.name}</strong>?
            </div>
            <div className="text-xs text-warm-gray">
              This will also move all review sources and forms associated with this location.
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className={primaryButtonClass}
              >
                {loading ? 'Moving...' : 'Confirm Move'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
