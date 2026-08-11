import { useEffect, useState, useCallback } from 'react'
import { FONT, SPACE, frameworkStyles } from '@/src/design'
import { View, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { useFocusEffect } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { api } from '@/src/lib/api'
import { Loader } from '@/src/components/Loader'
import { Reveal, stagger } from '@/src/components/motion'
import { Icon } from '@/src/components/icon'

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
  const radius = frameworkStyles(theme).radius
  return (
    <Card>
      {item.image_url ? (
        <ExpoImage source={{ uri: item.image_url }} style={{ width: '100%', height: 160, borderRadius: radius, marginBottom: SPACE.lg }} contentFit="cover" transition={150} />
      ) : (
        <View style={{ width: '100%', height: 120, borderRadius: radius, backgroundColor: c.bg3, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.lg }}>
          <Icon name="rocket" size={36} color={c.muted} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', flex: 1 }} numberOfLines={1}>{item.name || item.title}</Text>
        {item.status ? (
          <View style={{ backgroundColor: c.accent, borderRadius: 4, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs }}>
            <Text style={{ color: c.onAccent, fontSize: FONT.micro, fontWeight: '800', textTransform: 'uppercase' }}>{item.status}</Text>
          </View>
        ) : null}
      </View>
      {(item.description || item.roles) ? (
        <Text style={{ color: c.text2, fontSize: FONT.md, lineHeight: 17, marginTop: SPACE.sm }} numberOfLines={3}>
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
        <Reveal dir="up" duration={420}>
          <Title>Our projects</Title>
        </Reveal>
        <Loader />
      </Screen>
    )
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: SPACE.xxxl, paddingBottom: SPACE.colossal }}
      data={projects}
      keyExtractor={(p) => p.id}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <Reveal dir="up" delay={120} duration={520}>
        <>
          <Title>Our projects</Title>
          {err ? <Muted>{err}</Muted> : null}
        </>
        </Reveal>
      }
      ListEmptyComponent={<Muted>No projects published yet.</Muted>}
      renderItem={({ item, index }) => (
        <Reveal dir="scale" delay={stagger(index)} duration={420}>
          <ProjectCard item={item} />
        </Reveal>
      )}
    />
  )
}