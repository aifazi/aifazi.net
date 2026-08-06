# ── Frontend Dev Dockerfile — hot-reload Next.js dev server ───────────────────
FROM node:22.14-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Install deps first (cache layer — rebuild only when package.json changes)
COPY aifazi.net-frontend-next/package.json aifazi.net-frontend-next/package-lock.json ./
RUN npm ci

# Ensure the app user can write to /app, node_modules and .next.
# npm ci ran as root, and .next is an anonymous volume mounted at runtime —
# it inherits ownership from this image path, so it MUST be chowned here.
RUN mkdir -p /app/.next && chown -R app:app /app

EXPOSE 3000
ENV PORT=3000

# Drop privileges
USER app

# Next.js dev server with turbopack
CMD ["npx", "next", "dev", "--turbopack"]
