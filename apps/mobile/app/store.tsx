import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native'
import { useRouter , useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'
import { Icon } from '@/src/components/icon'

interface StoreCat {
  id: string
  slug: string
  name: string
  icon?: string
  description?: string
}

interface Product {
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
  rating?: { rating: number; count: number }
}

function price(p: Product) {
  return `$${((p.price_cents ?? 0) / 100).toFixed(2)}`
}

export default function StoreScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const [cats, setCats] = useState<StoreCat[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [cat, setCat] = useState<string>('')
  const [cartCount, setCartCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [err, setErr] = useState('')
  const radius = frameworkStyles(theme).radius
  const pillRadius = frameworkStyles(theme).buttonRadius

  const load = useCallback(() => {
    api
      .get('/store/products', { params: cat ? { category: cat, limit: 50 } : { limit: 50 } })
      .then((r) => setProducts((r.data ?? []) as Product[]))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load store'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [cat])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      load()
      api.get('/store/cart').then((r) => setCartCount(r.data?.count ?? 0)).catch(() => {})
    }, [load]),
  )

  useEffect(() => {
    api
      .get('/store/categories')
      .then((r) => setCats((r.data ?? []) as StoreCat[]))
      .catch(() => setCats([]))
  }, [])

  return (
    <Screen scroll={false}>
      <Reveal dir="up" duration={420}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title tag="STORE">Store</Title>
        <TouchableOpacity
          onPress={() => router.push('/store-cart' as Href)}
          style={{ marginBottom: SPACE.xl, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md, borderRadius: pillRadius, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Icon name="store" size={18} color={c.text} />
            <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700' }}>{cartCount > 0 ? `(${cartCount})` : ''}</Text>
          </View>
        </TouchableOpacity>
      </View>
      </Reveal>
      {cats.length > 0 ? (
        <Reveal dir="up" delay={120} duration={520}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.xl }}>
          <Reveal dir="scale" delay={stagger(0)} duration={420}>
          <TouchableOpacity
            onPress={() => setCat('')}
            style={{
              paddingHorizontal: SPACE.xl,
              paddingVertical: SPACE.sm,
              borderRadius: pillRadius,
              borderWidth: 1,
              borderColor: cat === '' ? c.accent : c.border,
              backgroundColor: cat === '' ? c.accent2 : 'transparent',
            }}
          >
            <Text style={{ color: cat === '' ? c.onAccent : c.text, fontSize: FONT.md, fontWeight: '700' }}>All</Text>
          </TouchableOpacity>
          </Reveal>
          {cats.map((x, i) => (
            <Reveal key={x.id} dir="scale" delay={stagger(i + 1)} duration={420}>
            <TouchableOpacity
              onPress={() => setCat(x.slug)}
              style={{
                paddingHorizontal: SPACE.xl,
                paddingVertical: SPACE.sm,
                borderRadius: pillRadius,
                borderWidth: 1,
                borderColor: cat === x.slug ? c.accent : c.border,
                backgroundColor: cat === x.slug ? c.accent2 : 'transparent',
              }}
            >
              <Text style={{ color: cat === x.slug ? c.onAccent : c.text, fontSize: FONT.md, fontWeight: '700' }}>
                {x.icon ?? ''} {x.name}
              </Text>
            </TouchableOpacity>
            </Reveal>
          ))}
        </View>
        </Reveal>
      ) : null}

      {loading ? (
        <Loader />
      ) : err ? (
        <Reveal dir="scale" delay={stagger(0)} duration={480}><Muted>{err}</Muted></Reveal>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
          }
          ListEmptyComponent={<Muted>No products yet.</Muted>}
          renderItem={({ item, index }) => (
            <Reveal dir="scale" delay={stagger(index)} duration={420}>
            <TouchableOpacity onPress={() => router.push(`/store-item?slug=${encodeURIComponent(item.slug)}` as Href)}>
              <Card>
                <View style={{ flexDirection: 'row', gap: SPACE.xl }}>
                  {item.image_url ? (
                    <ExpoImage source={{ uri: item.image_url }} style={{ width: 64, height: 64, borderRadius: radius }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 64, height: 64, borderRadius: radius, backgroundColor: c.bg3, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="store" size={30} color={c.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                      <Text style={{ color: c.text, fontSize: FONT.base, fontWeight: '700', flex: 1 }} numberOfLines={1}>{item.name}</Text>
                      {item.on_sale ? (
                        <View style={{ backgroundColor: c.danger, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ color: c.onAccent, fontSize: FONT.micro, fontWeight: '800' }}>SALE</Text>
                        </View>                      ) : null}
                    </View>
                    {item.description ? (
                      <Text style={{ color: c.text2, fontSize: FONT.md, marginTop: 3 }} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: 5 }}>
                      <Text style={{ color: c.accent, fontSize: FONT.base, fontWeight: '800' }}>{price(item)}</Text>
                      {item.compare_at_cents ? (
                        <Text style={{ color: c.muted, fontSize: FONT.md, textDecorationLine: 'line-through' }}>
                          ${((item.compare_at_cents ?? 0) / 100).toFixed(2)}
                        </Text>
                      ) : null}
                      {!item.in_stock ? <Text style={{ color: c.danger, fontSize: FONT.sm, fontWeight: '700' }}>Out of stock</Text> : null}
                      {item.rating?.count ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                          <Icon name="star" size={12} color={c.muted} />
                          <Text style={{ color: c.muted, fontSize: FONT.sm }}>{item.rating.rating?.toFixed(1)} ({item.rating.count})</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
            </Reveal>
          )}
        />
      )}
    </Screen>
  )
}