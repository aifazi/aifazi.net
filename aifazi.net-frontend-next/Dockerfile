FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# NOTE: NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they
# MUST be provided as build ARGs. Sensitive secrets (INTERNAL_API_SECRET, JWT_SECRET,
# ADMIN_GATE_SECRET) are read by middleware at runtime via process.env and MUST NOT be
# baked into image layers (otherwise `docker history` leaks them). They are supplied at
# `docker run -e ...` time by the orchestrator.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG INTERNAL_API_URL=http://backend:8000
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_COMETCHAT_APP_ID=
ARG NEXT_PUBLIC_COMETCHAT_AUTH_KEY=
ARG NEXT_PUBLIC_COMETCHAT_REGION=us
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV INTERNAL_API_URL=$INTERNAL_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_COMETCHAT_APP_ID=$NEXT_PUBLIC_COMETCHAT_APP_ID
ENV NEXT_PUBLIC_COMETCHAT_AUTH_KEY=$NEXT_PUBLIC_COMETCHAT_AUTH_KEY
ENV NEXT_PUBLIC_COMETCHAT_REGION=$NEXT_PUBLIC_COMETCHAT_REGION
ENV NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
# C14/H28: ENVIRONMENT=production forces proxy.ts admin-gate signature verification
# (the local-dev relaxation branch is disabled). Sensitive secrets are NOT set here —
# they must come from `docker run -e INTERNAL_API_SECRET=... -e JWT_SECRET=... -e
# ADMIN_GATE_SECRET=...`.
ENV NODE_ENV=production
ENV ENVIRONMENT=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Empty defaults; orchestrator supplies real values at runtime.
ENV INTERNAL_API_SECRET=
ENV JWT_SECRET=
ENV ADMIN_GATE_SECRET=
ENV INTERNAL_API_URL=http://backend:8000

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
