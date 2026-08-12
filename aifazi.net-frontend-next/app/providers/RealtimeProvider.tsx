'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth()

  // Contacts & staff_activity realtime (only for staff)
  useEffect(() => {
    if (!isAdmin) return
    const sb = getSupabase()
    if (!sb) return
    const contactsChannel = sb
      .channel('contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        window.dispatchEvent(new CustomEvent('contacts-updated'))
      })
      .subscribe()
    const activityChannel = sb
      .channel('staff-activity-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_activity' }, () => {
        window.dispatchEvent(new CustomEvent('staff-activity-updated'))
      })
      .subscribe()
    return () => {
      sb.removeChannel(contactsChannel)
      sb.removeChannel(activityChannel)
    }
  }, [isAdmin])

  return <>{children}</>
}