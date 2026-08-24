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
# See apps/capture-api/Dockerfile for the full story: some build hosts
# (observed on Railway) inject a registry config via environment variable
# that outranks anything `npm config set` writes to .npmrc, making even
# public `npm ci` calls fail with a 401. Pin it as an ENV (which npm
# respects directly) and as an explicit --registry flag (npm's highest-
# precedence config source) on every install.
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG__AUTH=
ENV NPM_CONFIG__AUTHTOKEN=

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org/ \
    || npm install --omit=dev --registry=https://registry.npmjs.org/

FROM base AS build
RUN npm install --registry=https://registry.npmjs.org/
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
