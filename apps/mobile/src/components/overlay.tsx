// Themed overlay kit — Dialog / ActionSheet / Toast.
// Replaces ALL native Alert.alert, action-sheet menus, and notification feedback
// with fully theme-synced in-app components. Render <OverlayProvider> once at the
// root and drive it via useOverlay(). All face the with a promise API:
//   await alert({ message })                          -> resolves when dismissed
//   const ok = await confirm({ title, message })       -> boolean
//   const v  = await menu({ title, options })          -> value | null
//   loading(true, 'text'); loading(false)
//   toast('message', 'success' | 'error' | 'info')

import { createContext, useContext, useRef, useState, ReactNode } from 'react'
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator, ViewStyle } from 'react-native'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { CODE_FONT, FONT, SPACE, micro, tagLabel } from '@/src/design'

export interface MenuOption {
  value: string
  label: string
  icon?: string
  color?: string
  destructive?: boolean
}

export interface OverlayApi {
  alert: (opts: { message: string; okText?: string }) => Promise<void>
  confirm: (opts: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    destructive?: boolean
  }) => Promise<boolean>
  menu: (opts: { title?: string; options: MenuOption[] }) => Promise<string | null>
  loading: (show: boolean, text?: string) => void
  toast: (message: string, kind?: 'info' | 'success' | 'error', durationMs?: number) => void
}

interface AlertState {
  message: string
  okText: string
  resolve: () => void
}

interface ConfirmState {
  title: string
  message: string
  confirmText: string
  cancelText: string
  destructive: boolean
  resolve: (v: boolean) => void
}

interface SheetState {
  title?: string
  options: MenuOption[]
  resolve: (v: string | null) => void
}

interface LoadingState {
  text?: string
}

interface ToastItem {
  key: number
  message: string
  kind: 'info' | 'success' | 'error'
}

const Ctx = createContext<OverlayApi | null>(null)

export function useOverlay(): OverlayApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOverlay must be used inside <OverlayProvider>')
  return ctx
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const { theme, framework } = useTheme()
  const c = theme.colors
  const dialogFw = framework.dialog
  const notifyFw = framework.notify
  const radius = dialogFw.radius
  const notifyPosition = framework.notifyPosition ?? 'bottom-right'

  const [alertState, setAlert] = useState<AlertState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [loading, setLoading] = useState<LoadingState | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastId = useRef(0)

  const showAlert = (opts: { message: string; okText?: string }) =>
    new Promise<void>((resolve) => setAlert({ message: opts.message, okText: opts.okText || 'OK', resolve }))

  const confirmFn = (opts: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    destructive?: boolean
  }) =>
    new Promise<boolean>((resolve) =>
      setConfirm({
        title: opts.title,
        message: opts.message,
        confirmText: opts.confirmText || 'Confirm',
        cancelText: opts.cancelText || 'Cancel',
        destructive: !!opts.destructive,
        resolve,
      }),
    )

  const menu = (opts: { title?: string; options: MenuOption[] }) =>
    new Promise<string | null>((resolve) => setSheet({ title: opts.title, options: opts.options, resolve }))

  const dismissAlert = () => {
    alertState?.resolve()
    setAlert(null)
  }

  const dismissConfirm = (v: boolean) => {
    confirm?.resolve(v)
    setConfirm(null)
  }

  const dismissSheet = (v: string | null) => {
    sheet?.resolve(v)
    setSheet(null)
  }

  const toast = (message: string, kind: 'info' | 'success' | 'error' = 'info', durationMs = 2600) => {
    toastId.current += 1
    const key = toastId.current
    setToasts((t) => [...t, { key, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((i) => i.key !== key)), durationMs)
  }

  const api: OverlayApi = {
    alert: showAlert,
    confirm: confirmFn,
    menu,
    loading: (show, text) => setLoading(show ? { text } : null),
    toast,
  }

  return (
    <Ctx.Provider value={api}>
      {children}

      {/* ── Toast layer ───────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <View pointerEvents="none" style={toastLayerStyle(notifyPosition)}>
          {toasts.map((t) => {
            const color = t.kind === 'error' ? c.danger : t.kind === 'success' ? c.accent : c.accent2
            return (
              <View key={t.key} style={[styles.toast, { backgroundColor: c.bg2, borderColor: color, borderRadius: notifyFw.radius }]}>
                <View style={[styles.toastDot, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[tagLabel(8.5, 2.5), { color, marginBottom: SPACE.xxs }]}>
                    {t.kind === 'error' ? 'ERROR' : t.kind === 'success' ? 'SUCCESS' : 'SYSTEM'}
                  </Text>
                  <Text style={[styles.toastMsg, { color: c.text, fontFamily: CODE_FONT }]}>{t.message}</Text>
                </View>
              </View>
            )
          })}
        </View>
      )}

      {/* ── Simple OK dialog ──────────────────────────────────────── */}
      {alertState && (
        <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={dismissAlert}>
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={dismissAlert} />
            <View style={[styles.card, { backgroundColor: c.bg2, borderColor: withAlpha(c.accent2, 0.3), borderRadius: radius }]}>
              <View style={[styles.accentBar, { backgroundColor: c.accent }]} />
              <Text style={[styles.message, { color: c.text2, fontFamily: CODE_FONT, lineHeight: 22 }]}>{alertState.message}</Text>
              <TouchableOpacity
                onPress={dismissAlert}
                style={[styles.primaryBtn, { borderColor: c.accent, borderRadius: theme.buttonRadius, backgroundColor: `${c.accent}14` }]}
              >
                <Text style={[micro(11, 2, '800'), { color: c.accent }]}>{alertState.okText.toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Confirm dialog ────────────────────────────────────────── */}
      {confirm && (
        <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => dismissConfirm(false)}>
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => dismissConfirm(false)} />
            <View style={[styles.card, { backgroundColor: c.bg2, borderColor: withAlpha(c.accent2, 0.3), borderRadius: radius }]}>
              <View style={[styles.accentBar, { backgroundColor: confirm.destructive ? withAlpha(c.danger, 0.8) : c.accent }]} />
              <Text style={[micro(12, 2, '800'), { color: confirm.destructive ? c.danger : c.accent2, marginBottom: SPACE.md }]}>
                {confirm.title.toUpperCase()}
              </Text>
              <Text style={[styles.message, { color: c.text2, fontFamily: CODE_FONT, lineHeight: 22 }]}>{confirm.message}</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  onPress={() => dismissConfirm(false)}
                  style={[styles.ghostBtn, { borderColor: c.border, borderRadius: theme.buttonRadius }]}
                >
                  <Text style={[micro(11, 2, '700'), { color: c.muted }]}>{confirm.cancelText.toUpperCase()}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => dismissConfirm(true)}
                  style={[
                    styles.primaryBtn,
                    {
                      borderColor: confirm.destructive ? c.danger : c.accent,
                      borderRadius: theme.buttonRadius,
                      backgroundColor: confirm.destructive ? `${c.danger}14` : `${c.accent}14`,
                    },
                  ]}
                >
                  <Text style={[micro(11, 2, '800'), { color: confirm.destructive ? c.danger : c.accent }]}>
                    {confirm.confirmText.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Action sheet / menu ───────────────────────────────────── */}
      {sheet && (
        <Modal transparent visible animationType="slide" statusBarTranslucent onRequestClose={() => dismissSheet(null)}>
          <View style={styles.backdropJustify}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => dismissSheet(null)} />
            <View style={[styles.sheetCard, { backgroundColor: c.bg2, borderColor: withAlpha(c.accent2, 0.25), borderTopLeftRadius: radius, borderTopRightRadius: radius }]}>
              <View style={[styles.accentBar, { backgroundColor: c.accent }]} />
              {sheet.title ? (
                <Text style={[micro(11, 3, '700'), { color: c.accent2, paddingHorizontal: SPACE.giant, paddingBottom: SPACE.md }]}>
                  {sheet.title.toUpperCase()}
                </Text>
              ) : null}
              <ScrollView bounces={false} style={{ maxHeight: 380 }}>
                {sheet.options.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    onPress={() => dismissSheet(o.value)}
                    style={[styles.sheetRow, { borderBottomColor: c.divider }]}
                  >
                    {o.icon ? <Text style={[styles.sheetIcon, { color: o.color || c.text }]}>{o.icon}</Text> : null}
                    <Text style={{ color: o.destructive ? c.danger : o.color || c.text, fontSize: FONT.card, fontWeight: '600', fontFamily: CODE_FONT }}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity onPress={() => dismissSheet(null)} style={[styles.sheetRow, styles.sheetCancel]}>
                <Text style={[micro(11, 2, '700'), { color: c.muted, textAlign: 'center', width: '100%' }]}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Loading modal ─────────────────────────────────────────── */}
      {loading && (
        <Modal transparent visible animationType="fade" statusBarTranslucent>
          <View style={styles.backdrop}>
            <View style={[styles.card, { backgroundColor: c.bg2, borderColor: withAlpha(c.accent2, 0.3), borderRadius: radius, alignItems: 'center', minWidth: 160 }]}>
              <ActivityIndicator color={c.accent} size="large" />
              {loading.text ? (
                <Text style={[micro(10, 2.5, '700'), { color: c.muted, marginTop: SPACE.xxl }]}>{loading.text.toUpperCase()}</Text>
              ) : null}
            </View>
          </View>
        </Modal>
      )}
    </Ctx.Provider>
  )
}

/**
 * Vertically/horizontally position the toast layer from the web `notifyPosition`
 * id (bottom-right, bottom-left, top-right, top-left, top-center). Falls back
 * to bottom-right when unset.
 */
function toastLayerStyle(pos: string): ViewStyle {
  const bottom = pos.startsWith('top') ? undefined : 0
  const top = pos.startsWith('top') ? 60 : undefined
  const align =
    pos === 'top-left' || pos === 'bottom-left' ? 'flex-start'
    : pos === 'top-right' || pos === 'bottom-right' ? 'flex-end'
    : 'center'
  return { top, bottom, left: 0, right: 0, alignItems: align, position: 'absolute', zIndex: 9999, paddingTop: top ?? 0, paddingHorizontal: SPACE.giant }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.mega,
  },
  backdropJustify: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: 368,
    padding: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  message: {
    fontSize: FONT.base,
    lineHeight: 21,
    marginBottom: SPACE.giant,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACE.xs,
    gap: SPACE.md,
  },
  primaryBtn: {
    paddingVertical: 11,
    paddingHorizontal: SPACE.giant,
    alignItems: 'center',
    borderWidth: 1,
  },
  ghostBtn: {
    paddingVertical: 11,
    paddingHorizontal: SPACE.giant,
    alignItems: 'center',
    borderWidth: 1,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  sheetCard: {
    width: '100%',
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: SPACE.lg,
    paddingTop: SPACE.xxl,
  },
  sheetRow: {
    paddingVertical: 15,
    paddingHorizontal: SPACE.giant,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetIcon: {
    fontSize: FONT.lead,
    marginRight: SPACE.xl,
    width: 24,
    textAlign: 'center',
  },
  sheetCancel: {
    borderBottomWidth: 0,
    marginTop: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: SPACE.xl,
    paddingHorizontal: SPACE.xxxl,
    marginBottom: SPACE.md,
    minWidth: 220,
    maxWidth: '100%',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  toastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACE.xl,
  },
  toastMsg: {
    fontSize: FONT.body,
    lineHeight: 17,
  },
})