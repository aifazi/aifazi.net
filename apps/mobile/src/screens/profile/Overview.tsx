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
import { ThemeToggle } from '@/src/components/ThemeToggle'
import { fmtDate, fmtWhen } from './helpers'
import { AppUpdatesCard } from './AppUpdates'

export function OverviewTab({ goEdit }: { goEdit: () => void }) {
  const { theme, setTheme, source, isLocked } = useTheme()
  const c = theme.colors
  const radius = Math.max(6, theme.radius)
  const { user, logout, refresh } = useAuth()
  const router = useRouter()
  const { confirm, menu } = useOverlay()

  const openThemeMenu = async () => {
    if (isLocked) return
    const pick = await menu({
      title: 'Choose theme',
      options: THEME_IDS.map((id) => ({
        value: id,
        label: `${THEMES[id].name}${theme.id === id ? '  ·  current' : ''}`,
        icon: '●',
        color: theme.id === id ? c.accent : THEMES[id].colors.accent,
      })),
    })
    if (pick && (THEME_IDS as string[]).includes(pick)) setTheme(pick as ThemeId)
  }

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
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: SPACE.colossal + SPACE.huge }}
      showsVerticalScrollIndicator={false}
    >
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
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.lg, marginBottom: SPACE.xl }}>
              <View style={{ flex: 1 }}>
                <MicroLabel style={{ marginBottom: SPACE.xs }}>APPEARANCE</MicroLabel>
                <Muted>Flip between light and dark</Muted>
              </View>
              <ThemeToggle />
            </View>
            <TouchableOpacity
              onPress={openThemeMenu}
              disabled={isLocked}
              accessibilityRole="button"
              accessibilityLabel="Choose theme"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.md,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: radius,
                backgroundColor: withAlpha(c.bg, 0.7),
                paddingHorizontal: SPACE.xl,
                paddingVertical: SPACE.xl,
                opacity: isLocked ? 0.55 : 1,
              }}
            >
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: THEMES[theme.id].colors.accent }} />
              <Text style={{ flex: 1, color: c.text, fontSize: FONT.md, fontWeight: '700' }}>{THEMES[theme.id].name}</Text>
              <Icon name="down" size={16} color={c.muted} />
            </TouchableOpacity>
          </>
        )}
      </Card>

      <AppUpdatesCard />
    </ScrollView>
  )
}