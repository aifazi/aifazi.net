// Themed overlay kit — Dialog / ActionSheet / Toast.
// Replaces ALL native Alert.alert, action-sheet menus, and notification feedback
// with fully theme-synced in-app components. Render <OverlayProvider> once at the
// root and drive it via useOverlay(). All face the with a promise API:
//   await alert({ message })                          -> resolves when dismissed
//   const ok = await confirm({ title, message })       -> boolean
//   const v  = await menu({ title, options })          -> value | null
//   loading(true, 'text'); loading(false)
//   toast('message', 'success' | 'error' | 'info')

import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react'
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import { useTheme } from '@/src/theme'

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
  const { theme } = useTheme()
  const c = theme.colors
  const mono = theme.mono

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
        <View pointerEvents="none" style={styles.toastLayer}>
          {toasts.map((t) => {
            const color = t.kind === 'error' ? c.danger : t.kind === 'success' ? c.accent : c.accent2
            return (
              <View
                key={t.key}
                style={[styles.toast, { backgroundColor: c.bg2, borderColor: color, borderRadius: mono ? 0 : 10 }]}
              >
                <View style={[styles.toastDot, { backgroundColor: color }]} />
                <Text style={{ color: c.text, fontSize: 13, flex: 1, fontFamily: mono ? 'monospace' : undefined }}>
                  {t.message}
                </Text>
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
            <View style={[styles.card, { backgroundColor: c.bg2, borderColor: c.border, borderRadius: mono ? 0 : 14 }]}>
              {mono ? <View style={[styles.accentBar, { backgroundColor: c.accent }]} /> : null}
              <Text style={[styles.message, { color: c.text, fontFamily: mono ? 'monospace' : undefined }]}>{alertState.message}</Text>
              <TouchableOpacity
                onPress={dismissAlert}
                style={[styles.primaryBtn, { borderColor: c.accent, borderRadius: mono ? 0 : 8, backgroundColor: `${c.accent}12` }]}
              >
                <Text style={{ color: c.accent, fontWeight: '800', fontFamily: mono ? 'monospace' : undefined }}>{alertState.okText}</Text>
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
            <View style={[styles.card, { backgroundColor: c.bg2, borderColor: c.border, borderRadius: mono ? 0 : 14 }]}>
              {mono ? <View style={[styles.accentBar, { backgroundColor: confirm.destructive ? c.danger : c.accent }]} /> : null}
              <Text style={[styles.title, { color: c.text, fontFamily: mono ? 'monospace' : undefined }]}>{confirm.title}</Text>
              <Text style={[styles.message, { color: c.text2, fontFamily: mono ? 'monospace' : undefined }]}>{confirm.message}</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  onPress={() => dismissConfirm(false)}
                  style={[styles.ghostBtn, { borderColor: c.border, borderRadius: mono ? 0 : 8 }]}
                >
                  <Text style={{ color: c.muted, fontWeight: '700', fontFamily: mono ? 'monospace' : undefined }}>{confirm.cancelText}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => dismissConfirm(true)}
                  style={[
                    styles.primaryBtn,
                    {
                      borderColor: confirm.destructive ? c.danger : c.accent,
                      borderRadius: mono ? 0 : 8,
                      backgroundColor: confirm.destructive ? `${c.danger}12` : `${c.accent}12`,
                    },
                  ]}
                >
                  <Text style={{ color: confirm.destructive ? c.danger : c.accent, fontWeight: '800', fontFamily: mono ? 'monospace' : undefined }}>
                    {confirm.confirmText}
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
            <View style={[styles.sheetCard, { backgroundColor: c.bg2, borderColor: c.border }]}>
              {mono ? <View style={[styles.accentBar, { backgroundColor: c.accent }]} /> : null}
              {sheet.title ? (
                <Text style={[styles.sheetTitle, { color: c.muted, fontFamily: mono ? 'monospace' : undefined }]}>{sheet.title}</Text>
              ) : null}
              <ScrollView bounces={false} style={{ maxHeight: 380 }}>
                {sheet.options.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    onPress={() => dismissSheet(o.value)}
                    style={[styles.sheetRow, { borderBottomColor: c.border }]}
                  >
                    {o.icon ? <Text style={[styles.sheetIcon, { color: o.color || c.text }]}>{o.icon}</Text> : null}
                    <Text style={{ color: o.destructive ? c.danger : o.color || c.text, fontSize: 15, fontWeight: '600', fontFamily: mono ? 'monospace' : undefined }}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity onPress={() => dismissSheet(null)} style={[styles.sheetRow, styles.sheetCancel]}>
                <Text style={{ color: c.muted, fontSize: 14, fontWeight: '700', textAlign: 'center', width: '100%', fontFamily: mono ? 'monospace' : undefined }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Loading modal ─────────────────────────────────────────── */}
      {loading && (
        <Modal transparent visible animationType="fade" statusBarTranslucent>
          <View style={styles.backdrop}>
            <View style={[styles.card, { backgroundColor: c.bg2, borderColor: c.border, borderRadius: mono ? 0 : 14, alignItems: 'center', minWidth: 160 }]}>
              <ActivityIndicator color={c.accent} size="large" />
              {loading.text ? (
                <Text style={{ color: c.muted, fontSize: 12, marginTop: 12, fontFamily: mono ? 'monospace' : undefined }}>{loading.text}</Text>
              ) : null}
            </View>
          </View>
        </Modal>
      )}
    </Ctx.Provider>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdropJustify: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 20,
    borderWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
    gap: 8,
  },
  primaryBtn: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
  },
  ghostBtn: {
    paddingVertical: 11,
    paddingHorizontal: 18,
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
    paddingBottom: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
  },
  sheetTitle: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sheetRow: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  sheetCancel: {
    borderBottomWidth: 0,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
  },
  toastLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    minWidth: 200,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  toastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
})