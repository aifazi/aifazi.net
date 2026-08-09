import { useEffect, useState } from 'react'
import { View, Text } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'

interface Order { order_number?: string; status?: string; total_cents?: number }

export default function StoreSuccessScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const params = useLocalSearchParams<{ session_id?: string }>()
  const [order, setOrder] = useState<Order | null>(null)

  useEffect(() => {
    let done = false
    const attempt = async (n: number) => {
      try {
        const r = await api.get('/store/orders')
        const rows = (r.data ?? []) as Order[]
        const latest = rows[0]
        if (latest) {
          if (!done) { setOrder(latest); return }
        }
      } catch { /* keep trying */ }
      if (!done && n > 0) setTimeout(() => attempt(n - 1), 1200)
    }
    attempt(6)
    return () => { done = true }
  }, [])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 56, marginBottom: 12 }}>✅</Text>
      <Text style={{ color: c.accent, fontSize: 20, fontWeight: '900', letterSpacing: 2, textAlign: 'center' }}>
        ORDER PLACED
      </Text>
      <Muted style={{ textAlign: 'center', marginTop: 10, lineHeight: 20, maxWidth: 360 }}>
        Thanks for supporting aifazi.net! {order?.order_number ? <>Your order number is <Text style={{ color: c.accent2, fontWeight: '700' }}>#{order.order_number}</Text>. </> : null}
        Payments are confirmed automatically and your order will appear in the profile Orders tab.
      </Muted>
      {params.session_id ? (
        <Muted style={{ textAlign: 'center', marginTop: 8, fontSize: 10 }}>Session {params.session_id.slice(0, 12)}…</Muted>
      ) : null}
      <View style={{ marginTop: 24, width: '100%', maxWidth: 320, gap: 10 }}>
        <Btn title="View orders" onPress={() => router.push('/profile' as Href)} />
        <Btn title="Back to store" variant="ghost" onPress={() => router.replace('/store' as Href)} />
      </View>
    </SafeAreaView>
  )
}
