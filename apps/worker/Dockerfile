FROM node:24-bookworm-slim AS base

# ffmpeg pro MP4 concat + runtime knihovny Chrome Headless Shellu
# (binárku stahuje @remotion/renderer, apt chromium už není potřeba).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    libnss3 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/render/package.json packages/render/package.json

RUN corepack enable && pnpm install --filter @masico/worker... --prod=false

# Zapéct Chrome Headless Shell do image — stejná (Remotionem pinovaná) verze
# lokálně i v provozu; ensureBrowser() v runtime je pak idempotentní no-op.
RUN cd apps/worker && node -e "import('@remotion/renderer').then((m) => m.ensureBrowser())"

COPY apps/worker apps/worker
COPY packages/shared packages/shared
COPY packages/render packages/render

CMD ["pnpm", "--filter", "@masico/worker", "dev"]
