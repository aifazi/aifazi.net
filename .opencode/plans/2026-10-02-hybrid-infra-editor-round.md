# Hybrid-Infra Editor Round — Plan (2026-10-02)

Four sequential PRs, each verified (tsc · lint · lint:hooks · vitest · build · e2e hybrid-infra) and merged individually via owner-automerge.

## Decisions (owner)
- Save issue: **reproduce all three cases and fix each** (editor toolbar reachability, save path feedback, viewer-fullscreen missing actions).
- Hardcoded canvas: **everything** drawn in normal diagram view becomes doc-driven and editable (rack U-grid stays structural; its titles become editable).
- Library redesign: **two-level — icon sidebar of categories + items list**.

---

## PR A — Fullscreen bug fixes (bugs first)

**Root cause:** the browser Fullscreen API puts the fullscreen element in the *top layer*; all other DOM renders underneath it regardless of z-index. `DialogModal` renders inline at the providers root and toasts portal to `document.body` — both outside the fullscreen subtree.

Changes:
1. `core/dialog.jsx` — portal `DialogModal` into `document.fullscreenElement || document.body`, re-target on `fullscreenchange`.
2. `core/notify.jsx` — same for `FixedHost` toast containers (banner/terminal/default). Site-wide benefit.
3. Viewer (`HybridInfra.tsx`) — when `isFullscreen`, render the primary actions (EXPORT PNG, EXPORT SVG, COPY LINK, view-mode toggle, status flash) *inside* `section.hi-stage` (stage header already holds zoom/EDIT/FULLSCREEN).
4. Editor (`HybridInfraEditor.tsx`) — **reproduce all three save hypotheses**:
   - a) toolbar wrap/scroll hides SAVE → sticky compact save cluster (SAVE + dirty badge + `notice`) pinned at top while `editFs`;
   - b) save path failure → debug `save()` (L1257) + `updateDiagram` concurrency; fix if broken;
   - c) viewer fullscreen has no save → covered by (3) EDIT affordance.
   - Add **Ctrl/Cmd+S** = save shortcut (no shortcut exists today, L819+ handler).
5. a11y: give the `notice` span `role="status"` (known AUDIT F13).

Verify: manual fullscreen checklist (viewer + editor: delete-confirm visible in fullscreen, save reachable + Ctrl+S, export actions visible in viewer fullscreen) + standard suite. Optional e2e only if headless fullscreen is reliable.

## PR B — Everything editable: doc-driven decorations

**Root cause:** `HybridInfraCanvas.renderFrame` (L1381-1412) unconditionally draws `drawZoneLabels()` (L627-638), collaboration bar (L1285-1293), legacy box (L1227-1243), Proxmox cluster panel (L1157-1170), AD caption (L1190-1201), endpoint captions (L1264-1281), rack titles (L942/L945) — none exist in `DiagramDoc`.

Schema (`data/hybrid-infra.ts`):
```ts
InfraDecoration =
  | { kind:'box',    id, label, x,y,w,h, color?, dashed?, lines?: string[] }
  | { kind:'label',  id, text, x,y, color?, size? }
DiagramDoc.decorations?: InfraDecoration[]   // sanitize: caps, clamps, unique ids
```
- Seeds (Plan A / Plan C + `TEMPLATE_SEEDS`) define their own decorations; renderer draws **only** `doc.decorations` — delete all hardcoded draw calls.
- Rack U-grid + node-driven chrome remain structural (derived from `rackU` nodes); rack/cluster/legacy **titles, panel text, captions** become decorations.
- Management-view overlay cards stay mode chrome (not diagram content).

Editor:
- Hit-testing + selection for decorations (nodes take precedence; box selected via border/title area or when no node hit; cycle option).
- Properties panel: kind, label/text, color, geometry, lines editor, lock, DELETE; toolbar `ADD BOX` / `ADD LABEL`.
- Copy/paste/duplicate/undo coverage via existing doc-op paths (extend `infraDocOps` + its tests).

Tests: `sanitizeDoc` decorations, doc-ops (duplicate/paste/remap), export sanity; seeds contain decorations (regression: no zone boxes lost).

Migration: built-in studies keep their look (decorations in seed data); user-saved diagrams render without legacy boxes until added (acceptable: they were never editable).

## PR C — Library expansion (data-only)

`data/infra-library.ts` 26 → ~55 items, new groups:
- **Cloud & SaaS**: Azure VM, Azure SQL, AWS EC2, AWS S3, Teams/Exchange Online, Power Platform.
- **Monitoring & Ops**: Prometheus, Grafana, Zabbix, ELK/Graylog, Uptime probe, SIEM.
- **Network extras**: Load balancer, VPN gateway, DNS, DHCP, NTP, Reverse proxy, WAF, Proxy.
- **Compute extras**: Hyper-V host, K8s cluster, Docker host, Jump box, Terminal server.
- **Storage extras**: NAS, SAN/iSCSI, Object storage, NVMe cache.
- **Continuity extras**: Tape library, Cloud archive, Replication target, Genesys? (no — keep IT-real: offsite NAS).
- **Endpoints & comms**: Printer/MFP, NVR/camera, VoIP PBX, Badge access, Digital signage.

Each item: name, role, category, layer, shape, defaultW/H, workloads. Validation test (unique keys, ≤ caps, groups non-empty).

## PR D — Library redesign (sidebar categories)

- Extract `components/InfraLibraryPalette.tsx` (palette is currently inline, editor L2054-2100).
- Layout: ~48px **icon sidebar** (one icon per category + "ALL"; active state; counts), main pane = item list of rich cards (**icon, name, role subtitle, category color**), search box on top (searching spans all categories → results view).
- `LibraryItem.icon` field (unicode/SVG set); drag-and-drop (`application/x-infra-library`) and click-to-place preserved; keyboard nav (↑/↓/Enter).
- `Ctrl+K` quick-add overlay reuses the same data + icons.
- Themed with existing `pal`/tokens; wide/narrow/fullscreen layouts respected (`.hi-edit-layout` responsive at L2747).

## Order & risk
| PR | Risk | Scope |
|---|---|---|
| A fullscreen fixes | medium (core dialog/notify portals) | small |
| B editable decorations | high (canvas render + schema + ops) | large |
| C library data | low | small |
| D library redesign | medium (UI extract) | medium |

Backend untouched in all four.

---

## Status — COMPLETED 2026-10-03

| PR | Branch | PR # | Merge |
|----|--------|------|-------|
| A fullscreen fixes | `fix/fullscreen-overlays` | #388 | `f938d84` |
| B editable decorations | `feat/infra-decorations` | #389 | `96d0758` |
| C library expansion | `feat/infra-library-expansion` | #390 | `3c3bc83` |
| D library redesign | `feat/infra-library-sidebar` | #391 | `18edda2` |

Deviations from the original sketch:

- PR B added backend persistence after all (`routers/infra_diagrams.py`
  `_validate_decorations` + create/update/revision roundtrip) so annotations
  survive save/load — "backend untouched in all four" does not hold.
- Library landed at 62 items / 9 groups (plan said ~55).
- Plan A's seed carries 16 decorations (3 zone boxes + 12 captions/labels +
  cluster panel + collaboration bar).

Final verification: frontend 125 tests + 1 skipped, lint 0 errors / 58
warnings baseline, local e2e 3/3 per PR; backend 200 tests (PR B only).
Merged remote branches cleaned up — only `origin/main` remains.
