# syntax=docker/dockerfile:1.7
#
# education-dashboard backend (Next.js API + Better Auth SSO) — deployed to
# morpheus (linux/arm64), tailnet-only on port 4200. Built natively on a
# GitHub-hosted ARM runner (.github/workflows/deploy.yml); morpheus only pulls.
# Same shape as login-adventistbot's frontend Dockerfile (the fleet's Next.js
# standalone reference).

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# better-auth's optional Svelte peers conflict with vitest's vite pin; the
# repo installs with legacy-peer-deps for the same reason.
RUN npm ci --legacy-peer-deps

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN NEXT_STANDALONE=1 npm run build

# Standalone output is flat: ./server.js, ./node_modules, ./package.json, ./.next
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4200
ENV HOSTNAME=0.0.0.0
USER node

COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static
# pdfjs-dist loads its worker (legacy/build/pdf.worker.mjs) via a dynamic
# import at runtime, which Next's standalone file tracer cannot see — the
# traced output ships pdf.mjs alone and every PDF import then fails with
# "Setting up fake worker failed: Cannot find module ... pdf.worker.mjs".
# Copy the whole package over the traced remnant so the worker is present.
COPY --chown=node:node --from=builder /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist

EXPOSE 4200

# /api/v1/health checks Mongo too, so "healthy" means actually serving data.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4200/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
