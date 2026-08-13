import { ScrollView, View, Text, TouchableOpacity } from 'react-native'
import { FONT, SPACE } from '@/src/design'
import { useRouter } from 'expo-router'
import { Card, Muted, Btn, MicroLabel, Chip } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { Avatar } from '@/src/components/Avatar'
import { PulsingDot } from '@/src/components/glow'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { THEME_IDS, THEMES, type ThemeId } from '@/src/themes'
import { withAlpha, statusTone } from '@/src/lib/color'
import { useOverlay } from '@/src/components/overlay'
import { fmtDate, fmtWhen } from './helpers'
import { AppUpdatesCard } from './AppUpdates'

/**
 * Compact live theme preview: the theme's bg, a mini surface + text sample and
 * its accent/secondary dots. Active theme gets an accent ring + glow so the
 * picker reads as a gallery instead of a row of buttons.
 */
function ThemeSwatch({ id, active, disabled, onPress }: { id: ThemeId; active: boolean; disabled?: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  const c = theme.colors
  const t = THEMES[id]
  const tc = t.colors
  const radius = Math.max(4, Math.min(t.radius, 12))
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={{
        flexBasis: '31%',
        flexGrow: 1,
        marginBottom: SPACE.lg,
        borderWidth: 1,
        borderColor: active ? withAlpha(c.accent, 0.95) : withAlpha(c.accent2, 0.18),
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: tc.bg2,
        shadowColor: active ? c.accent : '#000',
        shadowOpacity: active ? 0.45 : theme.dark ? 0.25 : 0.15,
        shadowRadius: active ? 14 : 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: active ? 6 : 2,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <View style={{ backgroundColor: tc.bg, padding: SPACE.lg, gap: SPACE.sm }}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tc.accent }} />
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tc.accent2 }} />
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tc.star }} />
        </View>
        <View style={{ backgroundColor: tc.bg2, borderRadius: Math.max(2, radius - 4), padding: 7, gap: SPACE.xs }}>
          <View style={{ width: '80%', height: 3, borderRadius: 2, backgroundColor: tc.text }} />
          <View style={{ width: '55%', height: 3, borderRadius: 2, backgroundColor: withAlpha(tc.text2, 0.6) }} />
          <View style={{ width: '40%', height: 3, borderRadius: 2, backgroundColor: withAlpha(tc.muted, 0.5) }} />
        </View>
      </View>
      <View style={{ alignItems: 'center', paddingVertical: SPACE.sm, paddingHorizontal: SPACE.sm }}>
        <Text
          numberOfLines={1}
          style={{ color: active ? c.accent : c.text2, fontSize: FONT.micro, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }}
        >
          {t.name}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export function OverviewTab({ goEdit }: { goEdit: () => void }) {
  const { theme, setTheme, toggleTheme, source, isLocked } = useTheme()
  const c = theme.colors
  const radius = Math.max(6, theme.radius)
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xxl }}>
          <View>
            <Avatar name={user?.username} avatar={user?.avatar} size={64} />
            <View style={{ position: 'absolute', right: -2, bottom: -2 }}>
              <PulsingDot color={c.success} size={9} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: FONT.lead, fontWeight: '900' }}>{user?.username}</Text>
            <View style={{ marginTop: SPACE.xs }}>
              <Chip label={user?.role ?? 'member'} color={statusTone(user?.role ?? '', c) ?? c.accent2} />
            </View>
          </View>
          <Btn title="Edit" onPress={goEdit} style={{ paddingVertical: SPACE.md, paddingHorizontal: SPACE.xxl }} />
        </View>

        {user?.bio ? <Text style={{ color: c.text2, fontSize: FONT.body, lineHeight: 18, marginTop: SPACE.xl }}>{user.bio}</Text> : null}

        <View style={{ flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.xxl }}>
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: SPACE.md, borderRadius: radius, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
            <Text style={{ color: c.text, fontSize: FONT.h3, fontWeight: '900' }}>
              {user?.last_seen || user?.lastSeen ? fmtWhen(user.last_seen || user.lastSeen).replace(/\s+ago$/, '') : '—'}
            </Text>
            <MicroLabel style={{ marginTop: SPACE.xs }}>LAST SEEN</MicroLabel>
          </View>
          <View style={{ flex: 1, alignItems: 'center', paddingVertical: SPACE.md, borderRadius: radius, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <PulsingDot color={c.success} size={7} halo={false} />
              <Text style={{ color: c.success, fontSize: FONT.h3, fontWeight: '900' }}>ONLINE</Text>
            </View>
            <MicroLabel style={{ marginTop: SPACE.xs }}>PRESENCE</MicroLabel>
          </View>
        </View>

        <View style={{ marginTop: SPACE.xl, gap: SPACE.xs }}>
          {user?.email ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Icon name="doc" size={14} color={c.muted} />
              <Muted>{user.email}{user?.email_verified === false ? ' (unverified)' : ''}</Muted>
            </View>
          ) : null}
          {fmtDate(user?.created_at || user?.createdAt) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Icon name="calendar" size={14} color={c.muted} />
              <Muted>Joined {fmtDate(user?.created_at || user?.createdAt)}</Muted>
            </View>
          ) : null}
          {user?.last_seen || user?.lastSeen ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Icon name="info" size={14} color={c.muted} />
              <Muted>Last seen {fmtWhen(user.last_seen || user.lastSeen)}</Muted>
            </View>
          ) : null}
          {linked.map((l) => (
            <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Icon name="link" size={14} color={c.muted} />
              <Muted>{l.label}: {l.value}</Muted>
            </View>
          ))}
        </View>

        <View style={{ marginTop: SPACE.xxl, gap: SPACE.lg }}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md }}>
            <Icon name="lock" size={14} color={c.muted} />
            <Muted>Theme switching is disabled — the admin has forced a theme site-wide.</Muted>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.xxl }}>
            <Btn
              title={theme.dark ? '☀️ Light' : '🌙 Dark'}
              variant="ghost"
              onPress={toggleTheme}
              style={{ paddingVertical: SPACE.md, paddingHorizontal: SPACE.xxl, flex: 1 }}
            />
            <Btn
              title="⏭ Next"
              variant="ghost"
              onPress={() => {
                const idx = THEME_IDS.indexOf(theme.id)
                setTheme(THEME_IDS[(idx + 1) % THEME_IDS.length])
              }}
              style={{ paddingVertical: SPACE.md, paddingHorizontal: SPACE.xxl, flex: 1 }}
            />
          </View>
        )}
        {(['dark', 'light'] as const).map((grp) => (
          <View key={grp} style={{ marginBottom: grp === 'dark' ? 14 : 0 }}>
            <MicroLabel style={{ marginBottom: SPACE.md }}>{grp === 'dark' ? 'Dark themes' : 'Light themes'}</MicroLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
              {THEME_IDS.filter((id) => THEMES[id].dark === (grp === 'dark')).map((id) => (
                <ThemeSwatch key={id} id={id} active={theme.id === id} disabled={isLocked} onPress={() => setTheme(id)} />
              ))}
            </View>
          </View>
        ))}
      </Card>

      <AppUpdatesCard />
    </ScrollView>
  )
}