# Slim Debian base + apt-installed ffmpeg. Debian's ffmpeg build in
# bookworm includes libx264/libfreetype/fontconfig — everything this app's
# filter graph (scale/pad/concat/drawtext) needs. fonts-dejavu-core gives
# drawtext a real .ttf to point at (see src/lib/font.ts's resolution
# order) without needing to bundle a font file into the repo.
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# See apps/capture-api/Dockerfile for why this is needed: some build
# hosts (observed on Railway) inject a registry/auth config that makes
# even public `npm ci` calls fail with a 401. `always-auth` is
# deliberately NOT set — npm 9+ removed it as a valid global config key,
# and setting it fails the build outright.
RUN npm config set registry https://registry.npmjs.org/

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM base AS build
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m appuser

WORKDIR /app
ENV NODE_ENV=production
ENV FONT_FILE_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

ENV PORT=8080
EXPOSE 8080
USER appuser

CMD ["node", "dist/server.js"]
