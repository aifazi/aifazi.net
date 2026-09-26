/**
 * core/Clickable.jsx — make a non-button surface keyboard-operable.
 *
 * Adds role="button", tabIndex=0, and Enter/Space activation so a clickable
 * <div>/<span> is not mouse-only. Prefer real <button> when the control is a
 * simple action; use this for cards/tiles that must stay non-button for layout.
 */
import { useCallback } from 'react'

export function keyboardActivate(onClick) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      onClick?.(e)
    }
  }
}

export default function Clickable({
  as: Tag = 'div',
  onClick,
  children,
  label,
  className,
  style,
  ...rest
}) {
  const onKeyDown = useCallback((e) => keyboardActivate(onClick)(e), [onClick])
  return (
    <Tag
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={className}
      style={{ cursor: 'pointer', ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
