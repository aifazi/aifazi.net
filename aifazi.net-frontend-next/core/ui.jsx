/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  UI CORE — Single import for everything.                    ║
 * ║                                                              ║
 * ║  SETUP (once in App.jsx):                                   ║
 * ║    import { UIProvider } from './core/ui'                   ║
 * ║    <UIProvider> ... </UIProvider>                           ║
 * ║                                                              ║
 * ║  IN ANY COMPONENT:                                           ║
 * ║    import { useUI, notify, dialog, contextMenu } from './core/ui'
 * ║    const { notify, dialog, menu } = useUI()                 ║
 * ║                                                              ║
 * ║  IMPERATIVE (outside React — utils, mutations, etc.):       ║
 * ║    import { notify, dialog } from './core/ui'               ║
 * ║    notify.success('Saved!')                                  ║
 * ║    await dialog.confirm({ title: 'Delete post?' })          ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── Re-export everything ──────────────────────────────────────────────────────
export * from './tokens.js'
export { t as transition, reveal, stagger, keyframe, hoverLift } from './animations.js'
export * from './fonts.js'
export { notify, useNotify, NotifyProvider } from './notify.jsx'
export { dialog, useDialog, DialogProvider } from './dialog.jsx'
export { contextMenu, useMenu, MenuProvider, MenuPanel, Dropdown } from './menu.jsx'
export { Input, TextArea, Select, Checkbox, Slider, DateTimePicker } from './forms.jsx'
export * from './framework-styles.js'

// ── Providers ─────────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react'
import { NotifyProvider } from './notify.jsx'
import { DialogProvider  } from './dialog.jsx'
import { MenuProvider    } from './menu.jsx'

// ── Framework context — holds active style for every UI component ─────────────
const FrameworkContext = createContext({
  menuStyle: 'cyber', notifyStyle: 'cyber', dialogStyle: 'cyber',
})
export const useFramework = () => useContext(FrameworkContext)

/**
 * UIProvider — passes frameworkConfig (menuStyle, notifyStyle, dialogStyle)
 * down to all sub-providers so every component renders with the chosen style.
 *
 * In App.jsx:
 *   <UIProvider frameworkConfig={siteConfig}>
 */
export function UIProvider({
  children,
  frameworkConfig = {},
  notifyPosition = 'bottom-right',
  maxToasts = 5,
}) {
  const fw = {
    menuStyle:   frameworkConfig.menuStyle   || 'cyber',
    notifyStyle: frameworkConfig.notifyStyle || 'cyber',
    dialogStyle: frameworkConfig.dialogStyle || 'cyber',
  }
  return (
    <FrameworkContext.Provider value={fw}>
      <NotifyProvider position={notifyPosition} maxToasts={maxToasts} notifyStyle={fw.notifyStyle}>
        <DialogProvider dialogStyle={fw.dialogStyle}>
          <MenuProvider menuStyle={fw.menuStyle}>
            {children}
          </MenuProvider>
        </DialogProvider>
      </NotifyProvider>
    </FrameworkContext.Provider>
  )
}

// ── useUI — one hook to get everything ───────────────────────────────────────
import { useNotify } from './notify.jsx'
import { useDialog } from './dialog.jsx'
import { useMenu   } from './menu.jsx'

/**
 * useUI() — convenience hook that returns all UI APIs at once.
 *
 * const { notify, dialog, menu } = useUI()
 * notify.success('Saved!')
 * await dialog.confirm({ title: 'Delete?' })
 * menu.openContextMenu(e, items)
 */
export function useUI() {
  const notify = useNotify()
  const dialog = useDialog()
  const menu   = useMenu()
  return { notify, dialog, menu }
}
