import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Btn, Muted } from '@/src/components/ui'
import { Icon } from '@/src/components/icon'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { api } from '@/src/lib/api'
import { useOverlay } from '@/src/components/overlay'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'

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
  const radius = frameworkStyles(theme).radius
  const pillRadius = frameworkStyles(theme).buttonRadius

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
        <Loader compact />
      </SafeAreaView>
    )
  }

  if (!p) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: SPACE.giant }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.danger, marginTop: SPACE.giant }}>{err || 'Product not found'}</Text>
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
      <Reveal dir="up" duration={420}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.lg, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }} numberOfLines={1}>{p.name}</Text>
      </View>
      </Reveal>

      <ScrollView contentContainerStyle={{ padding: SPACE.xxxl, paddingBottom: SPACE.colossal }}>
        <Reveal dir="up" delay={120} duration={520}>
        {displayImage ? (
          <ExpoImage source={{ uri: displayImage }} style={{ width: '100%', height: 220, borderRadius: radius, marginBottom: SPACE.xxl }} contentFit="cover" transition={150} />
        ) : (
          <View style={{ width: '100%', height: 160, borderRadius: radius, backgroundColor: c.bg3, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.xxl }}>
            <Icon name="store" size={44} color={c.muted} />
          </View>
        )}
        </Reveal>

        <Reveal dir="up" delay={160} duration={520}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginBottom: SPACE.md }}>
          <Text style={{ color: c.accent, fontSize: FONT.h2, fontWeight: '900' }}>${(priceCents / 100).toFixed(2)}</Text>
          {compareCents ? (
            <Text style={{ color: c.muted, fontSize: FONT.card, textDecorationLine: 'line-through' }}>${(compareCents / 100).toFixed(2)}</Text>
          ) : null}
          {p.on_sale ? (
            <View style={{ backgroundColor: c.danger, borderRadius: 4, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs }}>
              <Text style={{ color: c.onAccent, fontSize: FONT.xs, fontWeight: '800' }}>SALE</Text>
            </View>
          ) : null}
          {p.rating?.count ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Icon name="star" size={13} color={c.muted} />
              <Text style={{ color: c.muted, fontSize: FONT.body }}>{p.rating.rating?.toFixed(1)} ({p.rating.count})</Text>
            </View>
          ) : null}
        </View>

        {!p.in_stock ? <Text style={{ color: c.danger, fontSize: FONT.body, fontWeight: '700', marginBottom: SPACE.md }}>Out of stock</Text> : null}
        </Reveal>

        {p.variants && p.variants.length > 0 ? (
          <Reveal dir="up" delay={200} duration={520}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.xxl }}>
            {p.variants.map((v, i) => (
              <Reveal key={v.id} dir="scale" delay={stagger(i)} duration={420}>
              <TouchableOpacity
                onPress={() => setVariant(v.id)}
                disabled={!v.in_stock}
                style={{
                  paddingHorizontal: SPACE.xxl,
                  paddingVertical: SPACE.md,
                  borderRadius: pillRadius,
                  borderWidth: 1,
                  borderColor: variant === v.id ? c.accent : c.border,
                  backgroundColor: variant === v.id ? c.accent2 : 'transparent',
                  opacity: v.in_stock ? 1 : 0.4,
                }}
              >
                <Text style={{ color: variant === v.id ? c.onAccent : c.text, fontSize: FONT.body, fontWeight: '700' }}>
                  {v.name} · ${(v.price_cents / 100).toFixed(2)}
                </Text>
              </TouchableOpacity>
              </Reveal>
            ))}
          </View>
          </Reveal>
        ) : null}

        {p.description ? <Reveal dir="up" delay={240} duration={520}><Text style={{ color: c.text2, fontSize: FONT.body, lineHeight: 19, marginBottom: SPACE.xxl }}>{p.description}</Text></Reveal> : null}

        <Reveal dir="up" delay={260} duration={520}>
        <Btn title={adding ? 'Adding…' : 'Add to cart'} onPress={addToCart} disabled={adding} />
        </Reveal>

        <Reveal dir="up" delay={280} duration={520}>
        <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '800', marginTop: 22, marginBottom: SPACE.md }}>Reviews</Text>
        {reviews.length === 0 ? (
          <Muted>No reviews yet.</Muted>
        ) : (
          reviews.map((r, i) => (
            <Reveal key={r.id} dir="scale" delay={stagger(i)} duration={420}>
            <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: SPACE.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700' }}>{r.username}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Icon name="star" size={13} color={c.accent} />
                  <Text style={{ color: c.accent, fontSize: FONT.md }}>{r.rating}</Text>
                </View>
              </View>
              {r.title ? <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700', marginTop: 3 }}>{r.title}</Text> : null}
              {r.body ? <Text style={{ color: c.text2, fontSize: FONT.md, marginTop: SPACE.xxs }}>{r.body}</Text> : null}
            </View>
            </Reveal>
          ))
        )}
        </Reveal>
      </ScrollView>
    </SafeAreaView>
  )
}