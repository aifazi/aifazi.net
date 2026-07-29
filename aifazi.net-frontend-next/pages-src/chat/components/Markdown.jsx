'use client'
import { useState, useEffect } from 'react'
import { T, ENCRYPTED_PREFIX } from '../chat-constants'
import { decryptText, isEncrypted, getRoomKey } from '../chat-encryption'

export function Markdown({ text }) {
  const [decrypted, setDecrypted] = useState(isEncrypted(text) ? text : null)
  const decryptedText = decrypted === null ? text : decrypted

  useEffect(() => {
    if (!text || !isEncrypted(text)) { setDecrypted(null); return }
    const key = getRoomKey()
    decryptText(text.slice(ENCRYPTED_PREFIX.length), key).then(setDecrypted).catch(() => setDecrypted(text))
  }, [text])

  if (!text) return null

  const out = []
  const re = /(`{1,3})([\s\S]*?)\1/g
  let m, last = 0
  while ((m = re.exec(decryptedText))) {
    if (m.index > last) out.push({ t: 'tx', v: decryptedText.slice(last, m.index) })
    out.push({ t: 'cd', v: m[2] })
    last = re.lastIndex
  }
  out.push({ t: 'tx', v: decryptedText.slice(last) })
  return <>{out.map((p, i) => {
    if (p.t === 'cd') return (
      <code key={i} style={{ fontFamily: T.mono, fontSize: 11, background: 'rgba(0,0,0,0.5)', padding: '1px 6px', borderRadius: 4, color: T.accent }}>{p.v}</code>
    )
    const t = p.v.replace(/\*\*(.*?)\*\*/g, (_, b) => `\x01B${b}\x01E`)
    return <span key={i}>{t.split(/(\x01B.*?\x01E)/g).map((s, j) =>
      s.startsWith('\x01B') ? <strong key={j}>{s.slice(2, -2)}</strong> : <span key={j}>{s}</span>
    )}</span>
  })}</>
}
