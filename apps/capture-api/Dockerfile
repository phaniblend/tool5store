# Playwright's official image ships Chromium + all the OS-level deps
# (fonts, codecs, etc.) already installed, which is the single biggest
# source of pain when containerizing Playwright yourself. Pin to a
# specific version so the browser build always matches the npm package.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS base

WORKDIR /app
ENV NODE_ENV=production
# Pin the registry explicitly: some build hosts (observed on Railway)
# inject a registry/proxy config into the build environment that makes
# even public, unauthenticated `npm ci` calls fail with a 401. None of
# this repo's dependencies are private, so there's nothing to actually
# authenticate. (Note: `always-auth` is NOT set here — npm 9+, which this
# base image ships, removed it as a valid global config key entirely;
# setting it fails the build outright rather than being a no-op.)
RUN npm config set registry https://registry.npmjs.org/

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

# Dev deps needed for the TS build only; installed then discarded from the
# final layer set by using a build stage.
FROM base AS build
RUN npm install
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Cloud Run injects PORT; default kept in sync with src/server.ts.
ENV PORT=8080
EXPOSE 8080

# Playwright's base image already runs as the unprivileged `pwuser`.
USER pwuser

CMD ["node", "dist/server.js"]
