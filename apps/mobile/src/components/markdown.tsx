import { Text, Linking } from 'react-native'

function parseInline(text: string, baseColor: string, onLink?: (url: string) => void): any[] {
  const out: any[] = []
  const re = /(`{1,3})([\s\S]*?)\1|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  let m: RegExpExecArray | null
  let last = 0
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<Text key={k++} style={{ color: baseColor }}>{text.slice(last, m.index)}</Text>)
    if (m[2] !== undefined) {
      out.push(
        <Text key={k++} style={{ fontFamily: 'monospace', fontSize: 12, color: '#22d3ee', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 4, overflow: 'hidden', paddingHorizontal: 3 }}>
          {m[2]}
        </Text>,
      )
    } else if (m[3] !== undefined) {
      out.push(<Text key={k++} style={{ fontWeight: '800', color: baseColor }}>{m[3]}</Text>)
    } else if (m[4] !== undefined) {
      out.push(<Text key={k++} style={{ fontStyle: 'italic', color: baseColor }}>{m[4]}</Text>)
    } else if (m[5] !== undefined) {
      const url = m[5]
      out.push(
        <Text
          key={k++}
          style={{ color: '#22d3ee', textDecorationLine: 'underline' }}
          onPress={() => (onLink ?? Linking.openURL)(url)}
        >
          {url}
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
  if (!content) return null
  const lines = content.split('\n')
  return (
    <Text style={{ color, fontSize: 14, lineHeight: 19 }}>
      {lines.map((line, i) => (
        <Text key={i}>
          {parseInline(line, color, onLink)}
          {i < lines.length - 1 ? '\n' : null}
        </Text>
      ))}
    </Text>
  )
}
