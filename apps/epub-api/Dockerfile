# Same base as apps/capture-api and for the same reason: ships Chromium +
# all OS-level deps (fonts, codecs) already installed. Pin to a specific
# version so the browser build always matches the npm package.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

# NODE_ENV is deliberately NOT set to production until the runtime stage
# below — see apps/capture-api/Dockerfile: npm treats
# NODE_ENV=production as an implicit --omit=dev, which silently skips
# installing typescript here and fails the build with "tsc: not found".
FROM base AS build
RUN npm install
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

ENV PORT=8080
EXPOSE 8080

USER pwuser

CMD ["node", "dist/server.js"]
