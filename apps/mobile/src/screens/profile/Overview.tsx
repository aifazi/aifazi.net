import { ScrollView, View, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { Card, Muted, Btn, MicroLabel } from '@/src/components/ui'
import { Avatar } from '@/src/components/Avatar'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { THEME_IDS, THEMES } from '@/src/themes'
import { useOverlay } from '@/src/components/overlay'
import { fmtDate, fmtWhen } from './helpers'
import { AppUpdatesCard } from './AppUpdates'

export function OverviewTab({ goEdit }: { goEdit: () => void }) {
  const { theme, setTheme, toggleTheme, source, isLocked } = useTheme()
  const c = theme.colors
  const { user, logout, refresh } = useAuth()
  const router = useRouter()
  const { confirm } = useOverlay()

  const linked: { label: string; value?: string }[] = [
    { label: 'Discord', value: user?.discord_username },
    { label: 'Steam', value: user?.steam_username },
    { label: 'GitHub', value: user?.github_username },
  ].filter((x) => x.value)

  const logOut = async () => {
    const ok = await confirm({ title: 'Log out', message: 'Sign out of your account?', confirmText: 'Log out', destructive: true })
    if (!ok) return
    logout()
    refresh()
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={user?.username} avatar={user?.avatar} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '900' }}>{user?.username}</Text>
            <Text style={{ color: c.accent2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 }}>
              {user?.role ?? 'member'}
            </Text>
          </View>
          <Btn title="Edit" onPress={goEdit} style={{ paddingVertical: 8, paddingHorizontal: 14 }} />
        </View>

        {user?.bio ? <Text style={{ color: c.text2, fontSize: 13, lineHeight: 18, marginTop: 12 }}>{user.bio}</Text> : null}

        <View style={{ marginTop: 12, gap: 4 }}>
          {user?.email ? <Muted>✉️ {user.email}{user?.email_verified === false ? ' (unverified)' : ''}</Muted> : null}
          {fmtDate(user?.created_at || user?.createdAt) ? <Muted>📅 Joined {fmtDate(user?.created_at || user?.createdAt)}</Muted> : null}
          {user?.last_seen || user?.lastSeen ? <Muted>🕐 Last seen {fmtWhen(user.last_seen || user.lastSeen)}</Muted> : null}
          {linked.map((l) => (
            <Muted key={l.label}>🔗 {l.label}: {l.value}</Muted>
          ))}
        </View>

        <View style={{ marginTop: 14, gap: 10 }}>
          <Btn title="My chat" variant="ghost" onPress={() => router.push('/chat')} />
          <Btn title="Log out" variant="danger" onPress={logOut} />
        </View>
      </Card>

      <Card
        title="Theme"
        subtitle={
          isLocked
            ? 'Locked by the site admin'
            : source === 'user'
              ? 'Your choice'
              : source === 'os'
                ? 'Following your device setting'
                : source === 'global'
                  ? 'Site default'
                  : 'Default app theme'
        }
      >
        {isLocked ? (
          <Muted style={{ marginBottom: 8 }}>🔒 Theme switching is disabled — the admin has forced a theme site-wide.</Muted>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <Btn
              title={theme.dark ? '☀️ Light' : '🌙 Dark'}
              variant="ghost"
              onPress={toggleTheme}
              style={{ paddingVertical: 8, paddingHorizontal: 14, flex: 1 }}
            />
            <Btn
              title="⏭ Next"
              variant="ghost"
              onPress={() => {
                const idx = THEME_IDS.indexOf(theme.id)
                setTheme(THEME_IDS[(idx + 1) % THEME_IDS.length])
              }}
              style={{ paddingVertical: 8, paddingHorizontal: 14, flex: 1 }}
            />
          </View>
        )}
        {(['dark', 'light'] as const).map((grp) => (
          <View key={grp} style={{ marginBottom: grp === 'dark' ? 12 : 0 }}>
            <MicroLabel style={{ marginBottom: 8 }}>{grp === 'dark' ? 'Dark themes' : 'Light themes'}</MicroLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {THEME_IDS.filter((id) => THEMES[id].dark === (grp === 'dark')).map((id) => (
                <Btn
                  key={id}
                  title={THEMES[id].name}
                  variant={theme.id === id ? 'primary' : 'ghost'}
                  disabled={isLocked}
                  onPress={() => setTheme(id)}
                  style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                />
              ))}
            </View>
          </View>
        ))}
      </Card>

      <AppUpdatesCard />
    </ScrollView>
  )
}