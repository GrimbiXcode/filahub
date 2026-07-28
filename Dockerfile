# ---- Build ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY drizzle.config.ts ./
COPY db ./db
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3000}/health" >/dev/null || exit 1
CMD ["node", "dist/boot.js"]
