import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'

interface Variant {
  id: string
  name: string
  price_cents: number
  in_stock: boolean
  image_url?: string
}

interface Review {
  id: string
  rating: number
  title?: string
  body?: string
  username?: string
  created_at?: string
}

interface ProductDetail {
  id: string
  name: string
  slug: string
  description?: string
  price_cents?: number
  compare_at_cents?: number | null
  on_sale?: boolean
  image_url?: string
  category?: string
  category_id?: string
  in_stock?: boolean
  stock_qty?: number
  variants?: Variant[]
  rating?: { rating: number; count: number }
  deal?: any
}

export default function StoreItemScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const [p, setP] = useState<ProductDetail | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [variant, setVariant] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const { isAuthed } = useAuth()
  const { confirm, alert, toast } = useOverlay()

  const load = useCallback(() => {
    if (!slug) return
    api
      .get(`/store/products/${encodeURIComponent(slug)}`)
      .then((r) => {
        setP((r.data ?? null) as ProductDetail | null)
        setVariant('')
      })
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load product'))
      .finally(() => setLoading(false))
    api
      .get(`/store/products/${encodeURIComponent(slug)}/reviews`)
      .then((r) => setReviews((r.data ?? []) as Review[]))
      .catch(() => setReviews([]))
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    )
  }

  if (!p) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 20 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.danger, marginTop: 20 }}>{err || 'Product not found'}</Text>
      </SafeAreaView>
    )
  }

  const activeVariant = p.variants?.find((v) => v.id === variant)
  const priceCents = activeVariant?.price_cents ?? p.price_cents ?? 0
  const compareCents = activeVariant ? null : p.compare_at_cents ?? null
  const displayImage = activeVariant?.image_url || p.image_url

  const addToCart = async () => {
    if (!p) return
    if (!isAuthed) {
      const goLogin = await confirm({ title: 'Login required', message: 'Create an account or sign in to add items to your cart.', confirmText: 'Sign in', cancelText: 'Cancel' })
      if (goLogin) router.push('/auth/login')
      return
    }
    if (!p.in_stock && !activeVariant?.in_stock) {
      alert({ message: `${p.name} is currently out of stock.` })
      return
    }
    setAdding(true)
    try {
      await api.post('/store/cart', {
        product_id: p.id,
        quantity: 1,
        variant_id: variant || null,
      })
      toast(`${p.name} added to cart`, 'success')
    } catch (e: any) {
      toast(e?.response?.data?.detail || e?.message || 'Could not add to cart', 'error')
    } finally {
      setAdding(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ color: c.text, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>{p.name}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {displayImage ? (
          <ExpoImage source={{ uri: displayImage }} style={{ width: '100%', height: 220, borderRadius: 12, marginBottom: 14 }} contentFit="cover" transition={150} />
        ) : (
          <View style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: c.bg3, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 44 }}>🛍️</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Text style={{ color: c.accent, fontSize: 22, fontWeight: '900' }}>${(priceCents / 100).toFixed(2)}</Text>
          {compareCents ? (
            <Text style={{ color: c.muted, fontSize: 15, textDecorationLine: 'line-through' }}>${(compareCents / 100).toFixed(2)}</Text>
          ) : null}
          {p.on_sale ? (
            <View style={{ backgroundColor: c.danger, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>SALE</Text>
            </View>
          ) : null}
          {p.rating?.count ? (
            <Text style={{ color: c.muted, fontSize: 13 }}>★ {p.rating.rating?.toFixed(1)} ({p.rating.count})</Text>
          ) : null}
        </View>

        {!p.in_stock ? <Text style={{ color: c.danger, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>Out of stock</Text> : null}

        {p.variants && p.variants.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {p.variants.map((v) => (
              <TouchableOpacity
                key={v.id}
                onPress={() => setVariant(v.id)}
                disabled={!v.in_stock}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: variant === v.id ? c.accent : c.border,
                  backgroundColor: variant === v.id ? c.accent2 : 'transparent',
                  opacity: v.in_stock ? 1 : 0.4,
                }}
              >
                <Text style={{ color: variant === v.id ? '#001018' : c.text, fontSize: 13, fontWeight: '700' }}>
                  {v.name} · ${(v.price_cents / 100).toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {p.description ? <Text style={{ color: c.text2, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>{p.description}</Text> : null}

        <Btn title={adding ? 'Adding…' : 'Add to cart'} onPress={addToCart} disabled={adding} />

        <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginTop: 22, marginBottom: 8 }}>Reviews</Text>
        {reviews.length === 0 ? (
          <Muted>No reviews yet.</Muted>
        ) : (
          reviews.map((r) => (
            <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{r.username}</Text>
                <Text style={{ color: c.accent, fontSize: 12 }}>★ {r.rating}</Text>
              </View>
              {r.title ? <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginTop: 3 }}>{r.title}</Text> : null}
              {r.body ? <Text style={{ color: c.text2, fontSize: 12, marginTop: 2 }}>{r.body}</Text> : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}