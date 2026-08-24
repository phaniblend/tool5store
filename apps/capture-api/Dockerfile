# Playwright's official image ships Chromium + all the OS-level deps
# (fonts, codecs, etc.) already installed, which is the single biggest
# source of pain when containerizing Playwright yourself. Pin to a
# specific version so the browser build always matches the npm package.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS base

WORKDIR /app
ENV NODE_ENV=production
# Some build hosts (observed on Railway) inject a registry/proxy config
# into the build environment that makes even public, unauthenticated
# `npm ci` calls fail with a 401 — none of this repo's dependencies are
# private, so there's nothing to actually authenticate. `npm config set`
# alone didn't fix it (it only writes .npmrc, which environment variables
# outrank in npm's config precedence), so this pins the registry two ways:
# as an ENV npm respects directly, and as an explicit --registry flag on
# the install commands themselves, npm's highest-precedence config source.
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG__AUTH=
ENV NPM_CONFIG__AUTHTOKEN=

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org/ \
    || npm install --omit=dev --registry=https://registry.npmjs.org/

COPY tsconfig.json ./
COPY src ./src

# Dev deps needed for the TS build only; installed then discarded from the
# final layer set by using a build stage.
FROM base AS build
RUN npm install --registry=https://registry.npmjs.org/
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
