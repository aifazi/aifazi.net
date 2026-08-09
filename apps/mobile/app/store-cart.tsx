import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image as ExpoImage } from 'expo-image'
import { Btn, Muted } from '@/src/components/ui'
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
  const { toast, confirm, alert } = useOverlay()
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
    await alert({ message: 'Web checkout is coming soon to the mobile app. For now, complete your order on the website.' })
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>Cart</Text>
        {cart.items.length > 0 ? (
          <TouchableOpacity onPress={clear} hitSlop={10}>
            <Text style={{ color: c.danger, fontSize: 12, fontWeight: '700' }}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <Loader compact />
        </View>
      ) : cart.items.length === 0 ? (
        <View style={{ padding: 30, alignItems: 'center', gap: 14 }}>
          <Text style={{ fontSize: 40 }}>🛒</Text>
          <Muted>Your cart is empty.</Muted>
          <Btn title="Browse the store" onPress={() => router.replace('/store')} />
        </View>
      ) : (
        <FlatList
          data={cart.items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const img = item.variant?.image_url || item.product.image_url
            const label = item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name
            return (
              <View style={{ flexDirection: 'row', gap: 12, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                {img ? (
                  <ExpoImage source={{ uri: img }} style={{ width: 56, height: 56, borderRadius: 8 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: c.bg3, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>🛍️</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }} numberOfLines={2}>{label}</Text>
                  <Text style={{ color: c.accent, fontSize: 14, fontWeight: '800', marginTop: 3 }}>${(item.line_total_cents / 100).toFixed(2)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={() => changeQty(item, -1)} disabled={busy || item.quantity <= 1} hitSlop={8}>
                        <Text style={{ color: item.quantity <= 1 ? c.muted : c.text, fontSize: 16 }}>−</Text>
                      </TouchableOpacity>
                      <Text style={{ color: c.text, fontSize: 13, fontFamily: theme.mono ? 'monospace' : undefined }}>{item.quantity}</Text>
                      <TouchableOpacity onPress={() => changeQty(item, 1)} disabled={busy} hitSlop={8}>
                        <Text style={{ color: c.text, fontSize: 16 }}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => remove(item)} hitSlop={8}>
                      <Text style={{ color: c.danger, fontSize: 12 }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
          ListFooterComponent={
            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ color: c.muted, fontSize: 13 }}>Subtotal ({cart.count} items)</Text>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>${(cart.subtotal_cents / 100).toFixed(2)}</Text>
              </View>
              <Btn title="Checkout" onPress={checkout} />
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
