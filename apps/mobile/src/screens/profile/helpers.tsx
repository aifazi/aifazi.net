import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/src/theme'
import { statusTone, withAlpha } from '@/src/lib/color'
import { SPACE, tagLabel } from '@/src/design'

export function fmtDate(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export function fmtBytes(n?: number) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function fmtMoney(cents?: number) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`
}

export function fmtWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return fmtDate(iso)
}

/** Status pill used across orders/tickets/activity — mono, wide-track, angular. */
export function StatusChip({ text, tone }: { text: string; tone?: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  const color = tone ?? statusTone(text, c) ?? c.muted
  return (
    <View style={[styles.chip, { borderColor: withAlpha(color, 0.4), borderRadius: theme.mono ? 0 : 4 }]}>
      <Text style={[tagLabel(8.5, 1.8), { color }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    paddingVertical: 3,
  },
})