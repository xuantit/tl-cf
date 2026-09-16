import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAccountStore } from '../stores/useAccountStore'
import { SkeletonLine } from '../components/ui'

/** Shared route boundary only; tool navigation lives in the expandable menu. */
export default function CloudflareTools() {
  const { pathname } = useLocation()
  const accountId = useAccountStore((state) => state.activeAccountId)
  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <div className="min-w-0 flex-1">
        {/* Unmount the old tool/account so open editors and revealed secrets cannot linger. */}
        <Suspense key={`${accountId}:${pathname}`} fallback={<div className="space-y-3 p-6"><SkeletonLine width="80%" /><SkeletonLine width="60%" /></div>}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}