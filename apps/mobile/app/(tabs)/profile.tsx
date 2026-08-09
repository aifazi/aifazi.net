import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { Screen } from '@/src/components/Screen'
import { Title } from '@/src/components/ui'
import { Loader } from '@/src/components/Loader'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { OverviewTab } from '@/src/screens/profile/Overview'
import { OrdersTab } from '@/src/screens/profile/Orders'
import { TicketsTab } from '@/src/screens/profile/Tickets'
import { ActivityTab } from '@/src/screens/profile/Activity'
import { DocumentsTab } from '@/src/screens/profile/Documents'
import { SecurityTab } from '@/src/screens/profile/Security'
import { EditTab } from '@/src/screens/profile/Edit'
import { LoginCard } from '@/src/screens/profile/LoginCard'

type TabId = 'overview' | 'orders' | 'tickets' | 'activity' | 'documents' | 'security' | 'edit'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'activity', label: 'Activity' },
  { id: 'documents', label: 'Documents' },
  { id: 'security', label: 'Security' },
  { id: 'edit', label: 'Edit' },
]

export default function ProfileScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user, loading, isAuthed } = useAuth()
  const [tab, setTab] = useState<TabId>('overview')

  useEffect(() => {
    if (user) setTab('overview')
  }, [user?.id, user?._id])

  if (loading) {
    return (
      <Screen>
        <Loader label="LOADING PROFILE" />
      </Screen>
    )
  }

  if (!isAuthed) {
    return (
      <Screen scroll={false}>
        <Title tag="ACCOUNT">Profile</Title>
        <LoginCard />
      </Screen>
    )
  }

  return (
    <Screen scroll={false}>
      <Title tag="ACCOUNT">Profile</Title>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTab(t.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent + '22' : 'transparent' }}
              >
                <Text style={{ color: active ? c.accent : c.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {tab === 'overview' && <OverviewTab goEdit={() => setTab('edit')} />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'tickets' && <TicketsTab />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'edit' && <EditTab />}
    </Screen>
  )
}