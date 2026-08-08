# ---- Build ----
#
# Basisabbild auf den Digest festgenagelt, nicht auf das bewegliche Tag:
# Nur so baut derselbe Commit später dasselbe Abbild, und nur so lässt sich
# nachweisen, worauf ein Release aufsetzt.
#
# Achtung, das hat eine Bedingung: Ein festgenageltes Abbild bekommt keine
# Sicherheitsaktualisierungen mehr von allein. Dependabot hält den Digest
# nach (siehe .github/dependabot.yml, Ökosystem "docker") – bleiben diese
# Aktualisierungen liegen, ist ein Pin schlechter als das bewegliche Tag.
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019
LABEL org.opencontainers.image.title="filahub" \
      org.opencontainers.image.description="Inventory for 3D-printing filament with weigh-in based remaining quantity" \
      org.opencontainers.image.source="https://github.com/GrimbiXcode/filahub" \
      org.opencontainers.image.url="https://grimbixcode.github.io/filahub/" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
# wget für den Healthcheck (busybox-wget reichte nicht überall, s. IPv6-Hinweis)
RUN apk add --no-cache wget
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
# `--ignore-scripts`: Zur Laufzeit wird nichts kompiliert, aber jedes
# install-Skript einer Abhängigkeit liefe hier mit Root-Rechten im Bau.
#
# Danach fliegt npm selbst raus. Das ist kein Aufräumen um der 18 MB willen:
# npm bringt einen eigenen Abhängigkeitsbaum mit, der im fertigen Abbild
# liegen bleibt und dort mit jeder neuen Schwachstelle darin auftaucht –
# obwohl zur Laufzeit nur `node dist/boot.js` läuft und npm nie aufgerufen
# wird. Was nicht im Abbild ist, muss auch nicht gepatcht werden.
RUN npm ci --omit=dev --ignore-scripts \
    && rm -rf /usr/local/lib/node_modules/npm \
              /usr/local/bin/npm /usr/local/bin/npx \
              /root/.npm
COPY --from=build /app/dist ./dist
COPY drizzle.config.ts ./
COPY db ./db
# Ab hier nicht mehr als root. Das Abbild braucht zur Laufzeit keine
# Schreibrechte außerhalb von /tmp; `node` ist im Basisabbild schon angelegt.
USER node
EXPOSE 3000
# 127.0.0.1 statt localhost: Der Server lauscht auf IPv4 (0.0.0.0); löst
# localhost auf ::1 auf, schlägt der Check mit "Connection refused" fehl.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" >/dev/null || exit 1
CMD ["node", "dist/boot.js"]
