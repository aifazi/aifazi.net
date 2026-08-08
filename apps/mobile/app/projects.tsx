import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { useFocusEffect } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'

interface Project {
  id: string
  name: string
  title?: string
  description?: string
  long_description?: string
  image_url?: string
  status?: string
  url?: string
  github?: string
  roles?: string[]
  tags?: string[]
  display_order?: number
}

function ProjectCard({ item }: { item: Project }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Card>
      {item.image_url ? (
        <ExpoImage source={{ uri: item.image_url }} style={{ width: '100%', height: 160, borderRadius: 8, marginBottom: 10 }} contentFit="cover" transition={150} />
      ) : (
        <View style={{ width: '100%', height: 120, borderRadius: 8, backgroundColor: c.bg3, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 36 }}>🚀</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>{item.name || item.title}</Text>
        {item.status ? (
          <View style={{ backgroundColor: c.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: theme.dark ? '#000' : '#fff', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }}>{item.status}</Text>
          </View>
        ) : null}
      </View>
      {(item.description || item.roles) ? (
        <Text style={{ color: c.text2, fontSize: 12, lineHeight: 17, marginTop: 6 }} numberOfLines={3}>
          {item.description ?? ''}
          {item.roles?.length ? `\n${item.roles.join(' · ')}` : ''}
        </Text>
      ) : null}
    </Card>
  )
}

export default function ProjectsScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    api
      .get('/portfolio/projects')
      .then((r) => setProjects((r.data ?? []) as Project[]))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load projects'))
      .finally(() => setLoading(false))
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  if (loading) {
    return (
      <Screen>
        <Title>Our projects</Title>
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      </Screen>
    )
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={projects}
      keyExtractor={(p) => p.id}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          <Title>Our projects</Title>
          {err ? <Muted>{err}</Muted> : null}
        </>
      }
      ListEmptyComponent={<Muted>No projects published yet.</Muted>}
      renderItem={({ item }) => <ProjectCard item={item} />}
    />
  )
}