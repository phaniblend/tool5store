# Playwright's official image ships Chromium + all the OS-level deps
# (fonts, codecs, etc.) already installed, which is the single biggest
# source of pain when containerizing Playwright yourself. Pin to a
# specific version so the browser build always matches the npm package.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS base

WORKDIR /app
ENV NODE_ENV=production

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
