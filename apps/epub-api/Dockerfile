# Same base as apps/capture-api and for the same reason: ships Chromium +
# all OS-level deps (fonts, codecs) already installed. Pin to a specific
# version so the browser build always matches the npm package.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS base

WORKDIR /app
ENV NODE_ENV=production
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

COPY tsconfig.json ./
COPY src ./src

FROM base AS build
RUN npm install --registry=https://registry.npmjs.org/
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

ENV PORT=8080
EXPOSE 8080

USER pwuser

CMD ["node", "dist/server.js"]
