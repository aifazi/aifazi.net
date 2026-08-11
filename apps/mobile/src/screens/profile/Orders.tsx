import { useCallback, useEffect, useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { Loader } from '@/src/components/Loader'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { withAlpha } from '@/src/lib/color'
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
    return <Muted style={{ textAlign: 'center', marginTop: SPACE.colossal }}>No orders yet.</Muted>
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      {orders.map((o) => (
        <Card key={o.id} style={{ padding: SPACE.xl }}>
          <TouchableOpacity onPress={() => openDetail(o)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, flexWrap: 'wrap' }}>
              <Text style={{ color: c.accent2, fontSize: FONT.md, fontWeight: '800' }}>{o.order_number}</Text>
              <Muted>{fmtDate(o.created_at)}</Muted>
              <View style={{ flex: 1 }} />
              <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '800' }}>{fmtMoney(o.total_cents)}</Text>
              <StatusChip text={o.status || 'unknown'} />
            </View>
            {(o.items || []).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md }}>
                {(o.items || []).map((it, i) => (
                  <Text key={i} style={{ color: c.muted, fontSize: FONT.xs, backgroundColor: c.bg, paddingHorizontal: SPACE.md, paddingVertical: 3, borderRadius: 5 }}>
                    {it.product_name} × {it.quantity}
                  </Text>
                ))}
              </View>
            )}
            {o.tracking_number ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.md }}>
                <Icon name="orders" size={FONT.body} color={c.muted} />
                <Muted>{o.carrier || 'Carrier'}: {o.tracking_number}</Muted>
              </View>
            ) : null}
            {(o.downloads || []).length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md }}>
                {(o.downloads || []).map((d) => (
                  <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderWidth: 1, borderColor: withAlpha(c.accent, 0.25), borderRadius: 5, paddingHorizontal: SPACE.md, paddingVertical: 3 }}>
                    <Icon name="download" size={FONT.xs} color={c.accent} />
                    <Text style={{ color: c.accent, fontSize: FONT.xs }}>
                      {d.filename || d.product_name} ({d.downloads_used}/{d.downloads_allowed})
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        </Card>
      ))}

      {detail && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.overlay, padding: SPACE.xxxl, justifyContent: 'center' }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.md }}>
              <Text style={{ color: c.accent, fontSize: FONT.body, fontWeight: '800', letterSpacing: 1 }}>{detail.order_number}</Text>
              <StatusChip text={detail.status || 'unknown'} />
            </View>
            <Muted>Placed {detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</Muted>
            {(detail.carrier || detail.tracking_number) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.xs }}>
                <Icon name="orders" size={FONT.body} color={c.muted} />
                <Muted>{detail.carrier || ''} {detail.tracking_number || ''}</Muted>
              </View>
            )}

            <Text style={{ color: c.accent2, fontSize: FONT.micro, fontWeight: '800', letterSpacing: 2, marginTop: SPACE.xxl, marginBottom: SPACE.sm }}>STATUS TIMELINE</Text>
            {(detail.events || []).length === 0 ? (
              <Muted>No updates yet.</Muted>
            ) : (
              (detail.events || []).map((ev, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.lg, marginBottom: SPACE.md }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, marginTop: 5 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: FONT.md, fontWeight: '700', textTransform: 'uppercase' }}>{ev.status}</Text>
                    {ev.note ? <Muted>{ev.note}</Muted> : null}
                    <Muted style={{ fontSize: FONT.xs }}>{new Date(ev.created_at || '').toLocaleString()}</Muted>
                  </View>
                </View>
              ))
            )}

            <Text style={{ color: c.accent2, fontSize: FONT.micro, fontWeight: '800', letterSpacing: 2, marginTop: SPACE.lg, marginBottom: SPACE.sm }}>ITEMS</Text>
            {(detail.items || []).map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                <Text style={{ color: c.text, fontSize: FONT.md }}>{it.product_name} × {it.quantity}</Text>
                <Text style={{ color: c.muted, fontSize: FONT.md }}>{fmtMoney(it.price_cents)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.sm }}>
              <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '800' }}>Total</Text>
              <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '800' }}>{fmtMoney(detail.total_cents)}</Text>
            </View>

            <View style={{ marginTop: SPACE.xl }}>
              <Btn title="Close" variant="ghost" onPress={() => setDetail(null)} />
            </View>
          </Card>
        </View>
      )}
    </ScrollView>
  )
}