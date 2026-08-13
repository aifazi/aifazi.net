export const URL_RE = /\bhttps?:\/\/[^\s<>"']{6,}\b/i

export function extractUrl(content?: string): string {
  if (!content) return ''
  const m = content.match(URL_RE)
  return m ? m[0] : ''
}

export function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url)
}
