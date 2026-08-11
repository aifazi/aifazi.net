import { useEffect, useState } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { Screen } from '@/src/components/Screen'
import { Title } from '@/src/components/ui'
import { Loader } from '@/src/components/Loader'
import { Icon } from '@/src/components/icon'
import type { IconName } from '@/src/components/icon'
import { withAlpha } from '@/src/lib/color'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { webPillSnap } from '@/src/lib/carousel'
import { OverviewTab } from '@/src/screens/profile/Overview'
import { OrdersTab } from '@/src/screens/profile/Orders'
import { TicketsTab } from '@/src/screens/profile/Tickets'
import { ActivityTab } from '@/src/screens/profile/Activity'
import { DocumentsTab } from '@/src/screens/profile/Documents'
import { SecurityTab } from '@/src/screens/profile/Security'
import { EditTab } from '@/src/screens/profile/Edit'
import { LoginCard } from '@/src/screens/profile/LoginCard'
import { Reveal, stagger } from '@/src/components/motion'

type TabId = 'overview' | 'orders' | 'tickets' | 'activity' | 'documents' | 'security' | 'edit'

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'profile' },
  { id: 'orders', label: 'Orders', icon: 'orders' },
  { id: 'tickets', label: 'Tickets', icon: 'ticket' },
  { id: 'activity', label: 'Activity', icon: 'status' },
  { id: 'documents', label: 'Docs', icon: 'doc' },
  { id: 'security', label: 'Security', icon: 'shield' },
  { id: 'edit', label: 'Edit', icon: 'edit' },
]

export default function ProfileScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const { user, loading, isAuthed } = useAuth()
  const [tab, setTab] = useState<TabId>('overview')
  const pillRadius = frameworkStyles(theme).buttonRadius

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
        <Reveal dir="up" duration={420}>
          <Title tag="ACCOUNT">Profile</Title>
        </Reveal>
        <Reveal dir="up" delay={120} duration={520}>
          <LoginCard />
        </Reveal>
      </Screen>
    )
  }

  return (
    <Screen scroll={false}>
      <Reveal dir="up" duration={420}>
        <Title tag="ACCOUNT">Profile</Title>
      </Reveal>
      <Reveal dir="up" delay={120} duration={520}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} {...webPillSnap()} style={{ marginBottom: SPACE.xl, flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {TABS.map((t, i) => {
            const active = tab === t.id
            return (
              <Reveal key={t.id} dir="scale" delay={stagger(i)} duration={420}>
              <TouchableOpacity
                onPress={() => setTab(t.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  paddingHorizontal: SPACE.xxl,
                  paddingVertical: SPACE.sm,
                  borderRadius: pillRadius,
                  borderWidth: 1,
                  borderColor: active ? withAlpha(c.accent, 0.7) : c.border,
                  backgroundColor: active ? withAlpha(c.accent, 0.13) : 'transparent',
                  shadowColor: active ? c.accent : '#000',
                  shadowOpacity: active ? 0.35 : 0,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: active ? 2 : 0,
                }}
              >
                <Icon name={t.icon} size={13} color={active ? c.accent : c.muted} />
                <Text style={{ color: active ? c.accent : c.muted, fontSize: FONT.sm, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.label}</Text>
              </TouchableOpacity>
              </Reveal>
            )
          })}
        </View>
      </ScrollView>
      </Reveal>

      {tab === 'overview' && <Reveal dir="up" delay={160} duration={520}><OverviewTab goEdit={() => setTab('edit')} /></Reveal>}
      {tab === 'orders' && <Reveal dir="up" delay={160} duration={520}><OrdersTab /></Reveal>}
      {tab === 'tickets' && <Reveal dir="up" delay={160} duration={520}><TicketsTab /></Reveal>}
      {tab === 'activity' && <Reveal dir="up" delay={160} duration={520}><ActivityTab /></Reveal>}
      {tab === 'documents' && <Reveal dir="up" delay={160} duration={520}><DocumentsTab /></Reveal>}
      {tab === 'security' && <Reveal dir="up" delay={160} duration={520}><SecurityTab /></Reveal>}
      {tab === 'edit' && <Reveal dir="up" delay={160} duration={520}><EditTab /></Reveal>}
    </Screen>
  )
}