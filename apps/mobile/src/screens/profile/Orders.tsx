import { useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Loader } from '@/src/components/Loader'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { fmtDate, fmtMoney, StatusChip } from './helpers'

interface OrderItem { product_name?: string; quantity?: number; price_cents?: number }
interface Order {
  id?: string; order_number?: string; created_at?: string; total_cents?: number; status?: string
  items?: OrderItem[]; tracking_number?: string; carrier?: string; tracking_url?: string
  downloads?: { id?: string; token?: string; filename?: string; product_name?: string; downloads_used?: number; downloads_allowed?: number }[]
  events?: { status?: string; note?: string; created_at?: string }[]
}

export function OrdersTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Order | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/store/orders')
      .then((r) => setOrders(Array.isArray(r.data) ? r.data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const openDetail = async (o: Order) => {
    try {
      const r = await api.get(`/store/orders/${o.order_number}`)
      setDetail(r.data || o)
    } catch {
      setDetail(o)
    }
  }

  if (loading) {
    return <Loader />
  }
  if (orders.length === 0) {
    return <Muted style={{ textAlign: 'center', marginTop: 40 }}>No orders yet.</Muted>
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      {orders.map((o) => (
        <Card key={o.id} style={{ padding: 12 }}>
          <TouchableOpacity onPress={() => openDetail(o)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ color: c.accent2, fontSize: 12, fontWeight: '800' }}>{o.order_number}</Text>
              <Muted>{fmtDate(o.created_at)}</Muted>
              <View style={{ flex: 1 }} />
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>{fmtMoney(o.total_cents)}</Text>
              <StatusChip text={o.status || 'unknown'} />
            </View>
            {(o.items || []).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(o.items || []).map((it, i) => (
                  <Text key={i} style={{ color: c.muted, fontSize: 10, backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 }}>
                    {it.product_name} × {it.quantity}
                  </Text>
                ))}
              </View>
            )}
            {o.tracking_number ? (
              <Muted style={{ marginTop: 8 }}>
                📦 {o.carrier || 'Carrier'}: {o.tracking_number}
              </Muted>
            ) : null}
            {(o.downloads || []).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(o.downloads || []).map((d) => (
                  <Text key={d.id} style={{ color: c.accent, fontSize: 10, borderWidth: 1, borderColor: c.accent + '40', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 }}>
                    ⬇ {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed})
                  </Text>
                ))}
              </View>
            )}
          </TouchableOpacity>
        </Card>
      ))}

      {detail && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', padding: 16 }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>{detail.order_number}</Text>
              <StatusChip text={detail.status || 'unknown'} />
            </View>
            <Muted>Placed {detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</Muted>
            {(detail.carrier || detail.tracking_number) && (
              <Muted style={{ marginTop: 4 }}>📦 {detail.carrier || ''} {detail.tracking_number || ''}</Muted>
            )}

            <Text style={{ color: c.accent2, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginTop: 14, marginBottom: 6 }}>STATUS TIMELINE</Text>
            {(detail.events || []).length === 0 ? (
              <Muted>No updates yet.</Muted>
            ) : (
              (detail.events || []).map((ev, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, marginTop: 5 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{ev.status}</Text>
                    {ev.note ? <Muted>{ev.note}</Muted> : null}
                    <Muted style={{ fontSize: 10 }}>{new Date(ev.created_at || '').toLocaleString()}</Muted>
                  </View>
                </View>
              ))
            )}

            <Text style={{ color: c.accent2, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginTop: 10, marginBottom: 6 }}>ITEMS</Text>
            {(detail.items || []).map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: c.text, fontSize: 12 }}>{it.product_name} × {it.quantity}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>{fmtMoney(it.price_cents)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>Total</Text>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>{fmtMoney(detail.total_cents)}</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <Btn title="Close" variant="ghost" onPress={() => setDetail(null)} />
            </View>
          </Card>
        </View>
      )}
    </ScrollView>
  )
}