# ---- Build ----
FROM node:20-alpine AS build
# npm 10.8.2 (im Basis-Image) bricht `npm ci` sporadisch mit
# "Exit handler never called!" ab, ohne fehlzuschlagen -> neuere npm-Version
RUN npm install -g npm@11
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:20-alpine
RUN npm install -g npm@11
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY drizzle.config.ts ./
COPY db ./db
EXPOSE 3000
CMD ["node", "dist/boot.js"]
