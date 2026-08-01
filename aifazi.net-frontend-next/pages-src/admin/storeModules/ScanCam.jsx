'use client'
import React, { useEffect, useRef, useState } from 'react'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = '#00FF88', R = '#ff4757', C = '#00D4FF', Y = '#facc15'

// Phone-camera barcode scanner wrapper around html5-qrcode. Fires `onScan(code)`
// for each successfully decoded barcode (EAN/UPC/QR/Code128 etc.). Renders a
// compact scan window + manual entry field so it also works without a camera.
export default function ScanCam({ onScan, label = 'SCAN BARCODE', placeholder = 'Enter or scan barcode', autoStart = true }) {
  const [active, setActive] = useState(autoStart)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState('')
  const scannerRef = useRef(null)
  const streamRef = useRef(null)

  const stop = () => {
    try { scannerRef.current?.stop?.() } catch (e) { /* noop */ }
    scannerRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const start = () => {
    setErr('')
    setActive(true)
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const el = document.getElementById('aifazi-scan-region')
      if (!el) return
      const scanner = new Html5Qrcode('aifazi-scan-region')
      scannerRef.current = scanner
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 150 } },
        code => {
          scanner.pause?.(true)
          onScan?.(code)
          setTimeout(() => { try { scanner.resume?.() } catch (e) { /* noop */ } }, 900)
        },
        () => {},
      ).then(() => {
        // grab the video track so we can hard-stop on unmount
        const video = el.querySelector('video')
        streamRef.current = video?.srcObject || null
      }).catch(e => {
        setErr('Camera unavailable — use manual entry.')
        setActive(false)
      })
    }).catch(() => setErr('Scanner library failed to load.'))
  }

  useEffect(() => {
    if (autoStart) start()
    return () => { stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitManual = e => {
    e.preventDefault()
    const v = manual.trim()
    if (v) { onScan?.(v); setManual('') }
  }

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: C }}>{label}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {!active ? (
            <button onClick={start} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '5px 10px', background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.4)', color: C, borderRadius: 6, cursor: 'pointer' }}>▶ START CAMERA</button>
          ) : (
            <button onClick={() => { stop(); setActive(false) }} style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '5px 10px', background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.4)', color: R, borderRadius: 6, cursor: 'pointer' }}>■ STOP</button>
          )}
        </div>
      </div>

      {active && <div id="aifazi-scan-region" style={{ borderRadius: 8, overflow: 'hidden', background: '#000', minHeight: 150 }} />}
      {err && <div style={{ fontFamily: MONO, fontSize: 9, color: Y, marginTop: 8 }}>{err}</div>}

      <form onSubmit={submitManual} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          style={{ flex: 1, fontFamily: MONO, fontSize: 12, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '8px 12px', letterSpacing: 1 }}
        />
        <button type="submit" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '8px 16px', background: `${G}14`, border: `1px solid ${G}44`, color: G, borderRadius: 6, cursor: 'pointer' }}>LOOKUP</button>
      </form>
    </div>
  )
}
