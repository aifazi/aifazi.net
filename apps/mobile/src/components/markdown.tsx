import { Text, Linking } from 'react-native'
import { FONT } from '@/src/design'
import { useTheme } from '@/src/theme'

function parseInline(text: string, baseColor: string, link: string, onLink?: (url: string) => void): any[] {
  const out: any[] = []
  const re = /(`{1,3})([\s\S]*?)\1|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  let m: RegExpExecArray | null
  let last = 0
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<Text key={k++} style={{ color: baseColor }}>{text.slice(last, m.index)}</Text>)
    if (m[2] !== undefined) {
      out.push(
        <Text key={k++} style={{ fontFamily: 'monospace', fontSize: FONT.md, color: link, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 4, overflow: 'hidden', paddingHorizontal: 3 }}>
          {m[2]}
        </Text>,
      )
    } else if (m[3] !== undefined) {
      out.push(<Text key={k++} style={{ fontWeight: '800', color: baseColor }}>{m[3]}</Text>)
    } else if (m[4] !== undefined) {
      out.push(<Text key={k++} style={{ fontStyle: 'italic', color: baseColor }}>{m[4]}</Text>)
    } else if (m[5] !== undefined) {
      const url = m[6]
      out.push(
        <Text
          key={k++}
          style={{ color: link, textDecorationLine: 'underline' }}
          onPress={() => (onLink ?? Linking.openURL)(url)}
        >
          {m[5]}
        </Text>,
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(<Text key={k++} style={{ color: baseColor }}>{text.slice(last)}</Text>)
  return out
}

export function MarkdownText({
  content,
  color,
  onLink,
}: {
  content?: string | null
  color: string
  onLink?: (url: string) => void
}) {
  const { theme } = useTheme()
  if (!content) return null
  const lines = content.split('\n')
  const link = theme.colors.link
  return (
    <Text style={{ color, fontSize: FONT.base, lineHeight: 19 }}>
      {lines.map((line, i) => (
        <Text key={i}>
          {parseInline(line, color, link, onLink)}
          {i < lines.length - 1 ? '\n' : null}
        </Text>
      ))}
    </Text>
  )
}
