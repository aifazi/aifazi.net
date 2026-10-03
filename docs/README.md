# Project docs

| Doc | What it is | When to read |
|-----|-----------|--------------|
| [STATUS.md](STATUS.md) | **Start here** — current focus + prioritized open backlog (P0–P3) | Before picking up any work |
| [AUDIT.md](AUDIT.md) | Security/UX audits, rounds 1–5, with fix status per finding | When fixing audit items, or reviewing what was checked |
| [DESIGN-AUDIT.md](DESIGN-AUDIT.md) | Visual design review | Design/theme work |
| [VPS-INFRA-AUDIT.md](VPS-INFRA-AUDIT.md) | VPS/infra hardening state + standing risks | Ops/server work |
| [PREVIEW.md](PREVIEW.md) | PR workflow: preview deploy → test → merge | Before merging any PR |
| [ROADMAP.md](ROADMAP.md) | Ops backlog + past work log | Planning server/ops work |
| [SECURITY.md](SECURITY.md) | Threat model, security conventions, vulnerability reporting | Security work / reporting a vulnerability |
| [SECRETS-ROTATION.md](SECRETS-ROTATION.md) | Checklist for rotating leaked/rotated secrets | After a secret rotation |

Root-level files that stay at the repo root on purpose: `README.md` (GitHub landing page), `docker-compose.yml` + `Dockerfile.backend` (compose paths/`env_file` are relative to the repo root), and the dotfiles (`.gitignore`, `.env.example`, `.env.local.example`, `.gitattributes`, `.dockerignore`, `.easignore`).
