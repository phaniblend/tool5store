# Same base as apps/capture-api and for the same reason: ships Chromium +
# all OS-level deps (fonts, codecs) already installed. Pin to a specific
# version so the browser build always matches the npm package.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS base

WORKDIR /app
ENV NODE_ENV=production
# See apps/capture-api/Dockerfile: some build hosts (observed on Railway)
# inject a registry/auth config that makes even public npm ci calls fail
# with a 401. Pinning the registry sidesteps it.
RUN npm config set registry https://registry.npmjs.org/ \
    && npm config set always-auth false

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

FROM base AS build
RUN npm install
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
