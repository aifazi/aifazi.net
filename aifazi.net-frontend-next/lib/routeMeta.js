/**
 * Shared route metadata for dual-host surfaces (main site + fivem host).
 * Keep one source so /store vs /fivem/store and whitelist twins cannot drift.
 */
export const storeMetadata = {
  title: 'Store — AIFAZI RP',
  description:
    'Shop FiveM scripts, VIP packages, and digital goods for AIFAZI RP — Neon Ops City.',
  openGraph: {
    title: 'Store — AIFAZI RP',
    description: 'Shop FiveM scripts, VIP packages, and digital goods for AIFAZI RP.',
  },
}

export const whitelistMetadata = {
  title: 'Whitelist Application — AIFAZI RP',
  description:
    'Apply for whitelist access to AIFAZI RP — Neon Ops City, a serious QBX FiveM roleplay server.',
  openGraph: {
    title: 'Whitelist Application — AIFAZI RP',
    description: 'Apply for whitelist access to AIFAZI RP — Neon Ops City.',
  },
}
