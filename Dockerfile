# syntax=docker/dockerfile:1

# ---- build: all dependencies, compile TypeScript ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# `prisma generate` loads prisma.config.ts, which wants DATABASE_URL. It never connects, so a
# placeholder is enough at build time. The real value comes from the platform at runtime.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts/bootstrap-admin.ts ./scripts/bootstrap-admin.ts
RUN npm run build

# ---- runtime: production dependencies and the compiled output only ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# prisma (the CLI) is a production dependency on purpose: the platform runs
# `npx prisma migrate deploy` from this image as a separate release step, never on boot.
# The placeholder URL only lets the postinstall `prisma generate` load its config; the real
# DATABASE_URL (and every other setting) is injected by the platform at runtime.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci --omit=dev \
    && npm cache clean --force

COPY --from=build /app/dist ./dist

# The node image ships an unprivileged `node` user.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/server.js"]
