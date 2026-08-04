# ── Frontend Dev Dockerfile — hot-reload Next.js dev server ───────────────────
FROM node:22-alpine

WORKDIR /app

# Install deps first (cache layer — rebuild only when package.json changes)
COPY aifazi.net-frontend-next/package.json aifazi.net-frontend-next/package-lock.json ./
RUN npm ci

EXPOSE 3000
ENV PORT=3000

# Next.js dev server with turbopack
CMD ["npx", "next", "dev", "--turbopack"]
