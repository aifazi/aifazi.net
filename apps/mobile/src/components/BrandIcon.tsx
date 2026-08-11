import Svg, { Path } from 'react-native-svg'

/**
 * Official brand logos for OAuth buttons (Discord / Steam / GitHub), rendered
 * as inline SVG paths — the same artwork the web frontend uses in
 * aifazi.net-frontend-next/pages-src/ForumAuth.jsx. Requires react-native-svg
 * (added for this purpose). Tint follows the requested color; defaults to the
 * theme's light-on-brand text so logos stay readable on their brand background.
 */
export type Brand = 'discord' | 'steam' | 'github'

/**
 * Brand button backgrounds (mirrors web ForumAuth.jsx / ForumProfile.jsx):
 *   Discord  #5865F2  white logo
 *   Steam    #1b2838  #c7d5e0 logo (light accent #00b4ff)
 *   GitHub   #24292f  white logo
 */
export const BRAND_COLORS: Record<Brand, { bg: string; logo: string; border?: string }> = {
  discord: { bg: '#5865F2', logo: '#FFFFFF' },
  steam: { bg: '#1b2838', logo: '#c7d5e0', border: '#2a475e' },
  github: { bg: '#24292f', logo: '#FFFFFF', border: '#30363d' },
}

const VIEWBOX: Record<Brand, { w: number; h: number; vb: string }> = {
  discord: { w: 18, h: 14, vb: '0 0 71 55' },
  steam: { w: 18, h: 18, vb: '0 0 233 233' },
  github: { w: 18, h: 18, vb: '0 0 16 16' },
}

const PATHS: Record<Brand, string> = {
  discord:
    'M60.1 4.9A58.6 58.6 0 0 0 45.5.7a40.3 40.3 0 0 0-1.8 3.7 54.2 54.2 0 0 0-16.4 0A40 40 0 0 0 25.4.7 58.4 58.4 0 0 0 10.8 5C1.6 18.8-1 32.3.3 45.6a59.2 59.2 0 0 0 18 9.2c1.5-2 2.8-4.2 3.9-6.5a38.4 38.4 0 0 1-6.1-3 .3.3 0 0 1 0-.5l1.2-.9a42 42 0 0 0 36.2 0l1.2.9a.3.3 0 0 1 0 .5 38.9 38.9 0 0 1-6.2 3 36.5 36.5 0 0 0 3.9 6.5 59 59 0 0 0 18.1-9.2c1.5-15.6-2.5-29-10.4-40.7ZM23.7 37.7c-3.5 0-6.4-3.3-6.4-7.3s2.8-7.3 6.4-7.3c3.6 0 6.5 3.3 6.4 7.3 0 4-2.8 7.3-6.4 7.3Zm23.6 0c-3.5 0-6.4-3.3-6.4-7.3s2.8-7.3 6.4-7.3c3.6 0 6.5 3.3 6.4 7.3 0 4-2.8 7.3-6.4 7.3Z',
  steam:
    'M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z',
  github:
    'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z',
}

export function BrandIcon({ brand, color }: { brand: Brand; color?: string }) {
  const logo = color ?? BRAND_COLORS[brand].logo
  const dims = VIEWBOX[brand]

  return (
    <Svg width={dims.w} height={dims.h} viewBox={dims.vb}>
      <Path d={PATHS[brand]} fill={logo} />
    </Svg>
  )
}
