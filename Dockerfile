# ---- Build ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:26-alpine
# wget für den Healthcheck (busybox-wget reichte nicht überall, s. IPv6-Hinweis)
RUN apk add --no-cache wget
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY drizzle.config.ts ./
COPY db ./db
EXPOSE 3000
# 127.0.0.1 statt localhost: Der Server lauscht auf IPv4 (0.0.0.0); löst
# localhost auf ::1 auf, schlägt der Check mit "Connection refused" fehl.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" >/dev/null || exit 1
CMD ["node", "dist/boot.js"]
