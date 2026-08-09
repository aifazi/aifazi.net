import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native'
import { useRouter , useFocusEffect } from 'expo-router'
import type { Href } from 'expo-router'
import { Image as ExpoImage } from 'expo-image'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'

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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>Store</Title>
        <TouchableOpacity
          onPress={() => router.push('/store-cart' as Href)}
          style={{ marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.mono ? 0 : 8, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border }}
        >
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>🛒 {cartCount > 0 ? `(${cartCount})` : ''}</Text>
        </TouchableOpacity>
      </View>
      {cats.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setCat('')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: cat === '' ? c.accent : c.border,
              backgroundColor: cat === '' ? c.accent2 : 'transparent',
            }}
          >
            <Text style={{ color: cat === '' ? c.onAccent : c.text, fontSize: 12, fontWeight: '700' }}>All</Text>
          </TouchableOpacity>
          {cats.map((x) => (
            <TouchableOpacity
              key={x.id}
              onPress={() => setCat(x.slug)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: cat === x.slug ? c.accent : c.border,
                backgroundColor: cat === x.slug ? c.accent2 : 'transparent',
              }}
            >
              <Text style={{ color: cat === x.slug ? c.onAccent : c.text, fontSize: 12, fontWeight: '700' }}>
                {x.icon ?? ''} {x.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {loading ? (
        <Loader />
      ) : err ? (
        <Muted>{err}</Muted>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.bg2} />
          }
          ListEmptyComponent={<Muted>No products yet.</Muted>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/store-item?slug=${encodeURIComponent(item.slug)}` as Href)}>
              <Card>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {item.image_url ? (
                    <ExpoImage source={{ uri: item.image_url }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.bg3, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 24 }}>🛍️</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>{item.name}</Text>
                      {item.on_sale ? (
                        <View style={{ backgroundColor: c.danger, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>SALE</Text>
                        </View>
                      ) : null}
                    </View>
                    {item.description ? (
                      <Text style={{ color: c.text2, fontSize: 12, marginTop: 3 }} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                      <Text style={{ color: c.accent, fontSize: 14, fontWeight: '800' }}>{price(item)}</Text>
                      {item.compare_at_cents ? (
                        <Text style={{ color: c.muted, fontSize: 12, textDecorationLine: 'line-through' }}>
                          ${((item.compare_at_cents ?? 0) / 100).toFixed(2)}
                        </Text>
                      ) : null}
                      {!item.in_stock ? <Text style={{ color: c.danger, fontSize: 11, fontWeight: '700' }}>Out of stock</Text> : null}
                      {item.rating?.count ? (
                        <Text style={{ color: c.muted, fontSize: 11 }}>★ {item.rating.rating?.toFixed(1)} ({item.rating.count})</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </Screen>
  )
}