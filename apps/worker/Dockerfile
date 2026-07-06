FROM node:24-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/render/package.json packages/render/package.json

RUN corepack enable && pnpm install --filter @masico/worker... --prod=false

COPY apps/worker apps/worker
COPY packages/shared packages/shared
COPY packages/render packages/render

CMD ["pnpm", "--filter", "@masico/worker", "dev"]
