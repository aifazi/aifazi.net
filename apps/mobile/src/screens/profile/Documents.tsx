import { useCallback, useEffect, useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, ScrollView, Linking } from 'react-native'
import { Card, Muted, Btn } from '@/src/components/ui'
import { Loader } from '@/src/components/Loader'
import { useTheme } from '@/src/theme'
import { useOverlay } from '@/src/components/overlay'
import { api } from '@/src/lib/api'
import { pickLibraryImage, takeCameraPhoto, pickDocument, type PickedFile } from '@/src/lib/media'
import { fmtBytes, fmtDate } from './helpers'

interface Doc {
  id?: string; name?: string; category?: string; file_url?: string; mime_type?: string; file_size?: number; created_at?: string
}

export function DocumentsTab() {
  const { theme } = useTheme()
  const c = theme.colors
  const overlay = useOverlay()
  const { menu, toast, confirm } = overlay
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/documents')
      .then((r) => setDocs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const pick = async () => {
    const source = await menu({
      title: 'Upload document',
      options: [
        { value: 'camera', label: 'Take photo' },
        { value: 'library', label: 'Photo library' },
        { value: 'file', label: 'File (PDF, DOCX, ZIP…)' },
      ],
    })
    if (source === 'camera') { const f = await takeCameraPhoto({}, overlay); if (f) upload(f) }
    else if (source === 'library') { const f = await pickLibraryImage({}, overlay); if (f) upload(f) }
    else if (source === 'file') { const f = await pickDocument(); if (f) upload(f) }
  }

  const upload = async (file: PickedFile) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any)
      fd.append('name', file.name)
      fd.append('category', 'other')
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast('Document uploaded successfully.', 'success')
      load()
    } catch (e: any) {
      toast(e?.response?.data?.detail || e?.message || 'Could not upload.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const remove = async (id?: string) => {
    if (!id) return
    const ok = await confirm({ title: 'Delete document', message: 'Delete this document?', confirmText: 'Delete', destructive: true })
    if (!ok) return
    try {
      await api.delete(`/documents/${id}`)
      load()
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Could not delete.', 'error')
    }
  }

  if (loading) {
    return <Loader />
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={{ marginBottom: SPACE.lg }}>
        <Btn title={uploading ? 'Uploading…' : '⬆ Upload file'} onPress={pick} disabled={uploading} />
        <Muted style={{ marginTop: SPACE.sm }}>Documents are stored privately in your account.</Muted>
      </View>
      {docs.length === 0 ? (
        <Muted style={{ textAlign: 'center', marginTop: SPACE.jumbo }}>No documents yet.</Muted>
      ) : (
        docs.map((d) => (
          <Card key={d.id} style={{ padding: SPACE.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700' }}>{d.name}</Text>
                <Muted style={{ fontSize: FONT.xs }}>{d.category} · {fmtBytes(d.file_size)} · {fmtDate(d.created_at)}</Muted>
              </View>
              <Btn title="Open" variant="ghost" style={{ paddingVertical: SPACE.sm, paddingHorizontal: SPACE.xl }} onPress={() => { if (d.file_url) Linking.openURL(d.file_url) }} />
              <Btn title="Del" variant="danger" style={{ paddingVertical: SPACE.sm, paddingHorizontal: SPACE.xl }} onPress={() => remove(d.id)} />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  )
}