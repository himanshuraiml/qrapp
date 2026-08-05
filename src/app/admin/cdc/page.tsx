'use client'

import React from 'react'
import ModuleShell from '@/components/shell/ModuleShell'
import CdcDashboard from '@/modules/cdc/components/CdcDashboard'
import CdcAttendance from '@/modules/cdc/components/CdcAttendance'
import CdcReports from '@/modules/cdc/components/CdcReports'

export default function AdminCdcPage() {
  return (
    <ModuleShell module="cdc">
      <div className="space-y-8">
        <CdcDashboard />
        <CdcAttendance />
        <CdcReports />
      </div>
    </ModuleShell>
  )
}
