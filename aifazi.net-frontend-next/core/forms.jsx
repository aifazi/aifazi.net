'use client'
import { useEffect, useRef, useState } from 'react'
import { t, zIndex } from './tokens'
import DateTimePicker from './DateTimePicker.jsx'

const baseFont = { fontFamily: t.fontMono }

const fieldBase = {
  width: '100%',
  boxSizing: 'border-box',
  background: t.bg3,
  border: `var(--border-w, 1px) solid ${t.border}`,
  borderRadius: 'var(--radius, 6px)',
  color: t.text,
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  transition: 'border-color .14s ease, box-shadow .14s ease, background .14s ease',
  ...baseFont,
}

const normalizeOptions = options =>
  (options || []).map(option => {
    if (Array.isArray(option)) return { value: option[0], label: option[1] }
    if (typeof option === 'string' || typeof option === 'number') return { value: option, label: String(option) }
    return option
  })

export function Input({ value, onChange, placeholder, type = 'text', style = {}, disabled, ...props }) {
  if (type === 'datetime-local') {
    return (
      <DateTimePicker
        value={value}
        onChange={onChange}
        placeholder={placeholder || 'Pick date & time...'}
        disabled={disabled}
        style={style}
      />
    )
  }
  return (
    <input
      {...props}
      data-core-control="input"
      type={type}
      value={value}
      disabled={disabled}
      onChange={e => onChange?.(e.target.value, e)}
      placeholder={placeholder}
      style={{ ...fieldBase, cursor: disabled ? 'not-allowed' : undefined, opacity: disabled ? 0.55 : 1, ...style }}
      onFocus={e => {
        e.currentTarget.style.borderColor = t.cyan
        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,212,255,0.10)'
        props.onFocus?.(e)
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
        props.onBlur?.(e)
      }}
    />
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3, style = {}, disabled, ...props }) {
  return (
    <textarea
      {...props}
      data-core-control="textarea"
      value={value}
      disabled={disabled}
      onChange={e => onChange?.(e.target.value, e)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...fieldBase, resize: 'vertical', minHeight: rows * 34, cursor: disabled ? 'not-allowed' : undefined, opacity: disabled ? 0.55 : 1, ...style }}
      onFocus={e => {
        e.currentTarget.style.borderColor = t.cyan
        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,212,255,0.10)'
        props.onFocus?.(e)
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
        props.onBlur?.(e)
      }}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  style = {},
  disabled,
  placement = 'bottom-left',
  menuStyle = {},
}) {
  const opts = normalizeOptions(options)
  const selected = opts.find(option => String(option.value) === String(value))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const key = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', close, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', close)
    }
  }, [open])

  return (
    <div ref={ref} data-core-control="select" style={{ position: 'relative', width: '100%', ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...fieldBase,
          minHeight: 37,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          borderColor: open ? t.cyan : t.border,
          boxShadow: open ? '0 0 0 2px rgba(0,212,255,0.10)' : 'none',
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? t.text : t.muted }}>
          {selected?.icon ? `${selected.icon} ` : ''}{selected?.label || placeholder}
        </span>
        <span style={{ color: open ? t.cyan : t.muted, fontSize: 11, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: 'absolute',
            left: placement === 'bottom-right' ? 'auto' : 0,
            right: placement === 'bottom-right' ? 0 : 'auto',
            top: '100%',
            marginTop: 6,
            zIndex: zIndex.dropdown,
            minWidth: 220,
            maxWidth: 'min(420px, calc(100vw - 20px))',
            maxHeight: 320,
            overflowY: 'auto',
            background: 'rgba(8,16,28,0.96)',
            border: `var(--border-w, 1px) solid ${t.border}`,
            borderRadius: 'var(--radius, 8px)',
            padding: 5,
            boxShadow: '0 18px 48px rgba(0,0,0,.58), 0 0 0 1px rgba(0,212,255,.06)',
            backdropFilter: 'blur(14px)',
            ...menuStyle,
          }}
        >
          {opts.map(option => {
            const active = String(option.value) === String(value)
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={active}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return
                  onChange?.(option.value, option)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  minHeight: 34,
                  padding: '7px 10px',
                  border: 'none',
                  borderRadius: 5,
                  background: active ? 'rgba(0,212,255,.12)' : 'transparent',
                  color: active ? t.cyan : t.text,
                  cursor: option.disabled ? 'not-allowed' : 'pointer',
                  opacity: option.disabled ? 0.45 : 1,
                  textAlign: 'left',
                  ...baseFont,
                  fontSize: 12,
                }}
              >
                {option.icon && <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{option.icon}</span>}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.label}</span>
                {active && <span style={{ color: t.green, flexShrink: 0 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Checkbox({ checked, onChange, disabled, label, style = {} }) {
  return (
    <button
      type="button"
      data-core-control="checkbox"
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: t.bg3,
        border: `var(--border-w, 1px) solid ${checked ? 'rgba(0,255,136,0.55)' : t.border}`,
        borderRadius: 'var(--radius, 6px)',
        padding: '8px 12px',
        color: checked ? t.green : t.text,
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
        ...baseFont,
        ...style,
      }}
    >
      <span style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        border: `1px solid ${checked ? t.green : t.border}`,
        background: checked ? 'rgba(0,255,136,0.20)' : 'transparent',
        color: checked ? t.green : 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        flexShrink: 0,
      }}>✓</span>
      {label && <span>{label}</span>}
    </button>
  )
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, disabled, style = {} }) {
  const ref = useRef(null)
  const num = Number(value ?? min)
  const pct = max === min ? 0 : Math.min(100, Math.max(0, ((num - min) / (max - min)) * 100))

  const pick = clientX => {
    if (disabled || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const raw = min + ((clientX - r.left) / r.width) * (max - min)
    const stepped = Math.round(raw / step) * step
    const next = Math.min(max, Math.max(min, stepped))
    onChange?.(next)
  }

  const start = e => {
    pick(e.clientX)
    const move = ev => pick(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={ref}
      data-core-control="slider"
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={num}
      onPointerDown={start}
      style={{
        position: 'relative',
        height: 18,
        minWidth: 60,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        touchAction: 'none',
        ...style,
      }}
    >
      <div style={{ position:'absolute', left:0, right:0, top:'50%', height:4, transform:'translateY(-50%)',
        background:'rgba(255,255,255,0.14)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:'linear-gradient(90deg,var(--green),var(--cyan))',
          boxShadow:'0 0 12px rgba(0,212,255,0.32)' }} />
      </div>
      <div style={{ position:'absolute', left:`calc(${pct}% - 6px)`, top:'50%', width:12, height:12,
        transform:'translateY(-50%)', borderRadius:'50%', background:t.text,
        border:'1px solid rgba(0,212,255,0.55)', boxShadow:'0 0 10px rgba(0,255,136,0.65)' }} />
    </div>
  )
}

export { DateTimePicker }
