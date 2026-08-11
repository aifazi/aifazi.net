import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import { Image as ExpoImage } from 'expo-image'
import { Btn, Muted } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'

interface CartItem {
  id: string
  variant_id?: string | null
  product: { id: string; name: string; slug: string; image_url?: string; price_cents?: number }
  variant?: { id: string; name: string; price_cents?: number; image_url?: string } | null
  quantity: number
  unit_price_cents: number
  line_total_cents: number
}

interface Cart {
  items: CartItem[]
  subtotal_cents: number
  count: number
}

export default function StoreCartScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const radius = frameworkStyles(theme).radius
  const { toast, confirm } = useOverlay()
  const [cart, setCart] = useState<Cart>({ items: [], subtotal_cents: 0, count: 0 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await api.get('/store/cart')
      setCart((r.data ?? { items: [], subtotal_cents: 0, count: 0 }) as Cart)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not load cart')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const changeQty = async (item: CartItem, delta: number) => {
    const qty = Math.max(1, item.quantity + delta)
    setBusy(true)
    try {
      const r = await api.patch(`/store/cart/${item.id}`, { quantity: qty })
      setCart((r.data ?? cart) as Cart)
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Could not update', 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (item: CartItem) => {
    const ok = await confirm({ title: 'Remove item', message: `Remove ${item.product.name} from your cart?`, confirmText: 'Remove', destructive: true })
    if (!ok) return
    try {
      const r = await api.delete(`/store/cart/${item.id}`)
      setCart((r.data ?? cart) as Cart)
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Could not remove', 'error')
    }
  }

  const clear = async () => {
    const ok = await confirm({ title: 'Clear cart', message: 'Remove all items?', confirmText: 'Clear', destructive: true })
    if (!ok) return
    try {
      const r = await api.post('/store/cart/clear')
      setCart((r.data ?? { items: [], subtotal_cents: 0, count: 0 }) as Cart)
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Could not clear', 'error')
    }
  }

  const checkout = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const r = await api.post('/store/checkout/cart', {
        success_url: 'aifazi:///store-success?session_id={{CHECKOUT_SESSION_ID}}',
        cancel_url: 'aifazi:///store-cart',
      })
      const url = r.data?.url
      if (!url) {
        setErr('Checkout could not be started.')
        return
      }
      // Open the Stripe Checkout session. When the user completes/cancels,
      // Stripe redirects back to the aifazi:// deep link and this resolves.
      const res = await WebBrowser.openAuthSessionAsync(url, 'aifazi:///store-success')
      if (res.type === 'success') {
        const sessionId = /[?&]session_id=([^&#]+)/.exec(res.url || '')?.[1] || ''
        // Clear the now-paid cart server-side so the badge and cart stay in sync.
        await api.post('/store/cart/clear').catch(() => {})
        router.replace(`/store-success${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''}` as Href)
      } else {
        await load()
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Checkout failed.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.lg, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }}>Cart</Text>
        {cart.items.length > 0 ? (
          <TouchableOpacity onPress={clear} hitSlop={10}>
            <Text style={{ color: c.danger, fontSize: FONT.md, fontWeight: '700' }}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={{ paddingTop: SPACE.colossal, alignItems: 'center' }}>
          <Loader compact />
        </View>
      ) : cart.items.length === 0 ? (
        <View style={{ padding: SPACE.jumbo, alignItems: 'center', gap: SPACE.xxl }}>
          <Text style={{ fontSize: 40 }}>🛒</Text>
          <Muted>Your cart is empty.</Muted>
          <Btn title="Browse the store" onPress={() => router.replace('/store')} />
        </View>
      ) : (
        <FlatList
          data={cart.items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: SPACE.xxl, paddingBottom: SPACE.giant }}
          renderItem={({ item }) => {
            const img = item.variant?.image_url || item.product.image_url
            const label = item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name
            return (
                <View style={{ flexDirection: 'row', gap: SPACE.xl, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border, borderRadius: radius, padding: SPACE.xl, marginBottom: SPACE.lg }}>
                  {img ? (
                  <ExpoImage source={{ uri: img }} style={{ width: 56, height: 56, borderRadius: radius }} contentFit="cover" />
                  ) : (
                  <View style={{ width: 56, height: 56, borderRadius: radius, backgroundColor: c.bg3, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: FONT.h2 }}>🛍️</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700' }} numberOfLines={2}>{label}</Text>
                  <Text style={{ color: c.accent, fontSize: FONT.base, fontWeight: '800', marginTop: 3 }}>${(item.line_total_cents / 100).toFixed(2)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginTop: SPACE.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                      <TouchableOpacity onPress={() => changeQty(item, -1)} disabled={busy || item.quantity <= 1} hitSlop={8}>
                        <Text style={{ color: item.quantity <= 1 ? c.muted : c.text, fontSize: FONT.section }}>−</Text>
                      </TouchableOpacity>
                      <Text style={{ color: c.text, fontSize: FONT.body, fontFamily: theme.mono ? 'monospace' : undefined }}>{item.quantity}</Text>
                      <TouchableOpacity onPress={() => changeQty(item, 1)} disabled={busy} hitSlop={8}>
                        <Text style={{ color: c.text, fontSize: FONT.section }}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => remove(item)} hitSlop={8}>
                      <Text style={{ color: c.danger, fontSize: FONT.md }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
          ListFooterComponent={
            <View style={{ marginTop: SPACE.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.lg }}>
                <Text style={{ color: c.muted, fontSize: FONT.body }}>Subtotal ({cart.count} items)</Text>
                <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '800' }}>${(cart.subtotal_cents / 100).toFixed(2)}</Text>
              </View>
              <Btn title="Checkout" onPress={checkout} />
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
