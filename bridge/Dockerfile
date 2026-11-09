# filahub-Brücke für PrusaLink (seit 4.7.0)
#
# Ein Image mit nichts als Node und einer Datei: Die Brücke hat keine
# Abhängigkeiten, Node 26 führt TypeScript direkt aus. Gestartet wird mit dem
# Befehl, den die App unter „Verbindungen“ anzeigt:
#
#   docker run -d --name filahub-bridge --restart unless-stopped \
#     -v filahub-bridge:/data \
#     -e FILAHUB_URL=https://… -e FILAHUB_TOKEN=fh_… \
#     ghcr.io/grimbixcode/filahub-bridge:latest
#
# Dasselbe Basis-Image wie die App (Digest gepinnt, siehe ../Dockerfile).
FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94
LABEL org.opencontainers.image.title="filahub-bridge" \
      org.opencontainers.image.description="Holt fertige Drucke von Prusa-Druckern (PrusaLink) und liefert sie an filahub" \
      org.opencontainers.image.source="https://github.com/GrimbiXcode/filahub" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

WORKDIR /app
COPY filahub-bridge.ts ./
# /data hält die Warteschlange, falls filahub kurz nicht erreichbar ist
RUN mkdir -p /data && chown node:node /data
USER node
ENV DATA_DIR=/data NODE_ENV=production
VOLUME ["/data"]

# Lebt die Schleife noch? Die Brücke schreibt je Durchlauf (alle 3 s) eine Datei.
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const t=Number(require('fs').readFileSync('/tmp/filahub-bridge-alive','utf8'));process.exit(Date.now()-t<120000?0:1)"

CMD ["node", "--disable-warning=ExperimentalWarning", "filahub-bridge.ts"]
