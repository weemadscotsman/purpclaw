# ============================================================
# VOID // Dockerfile
# Multi-stage build. Minimal runtime. The void is small.
# ============================================================

# ---- Stage 1: Build ------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /build

RUN npm init -y > /dev/null && npm install --silent html-minifier-terser

COPY public/ /build/public/

RUN find /build/public -name '*.html' -exec \
    node -e "require('html-minifier-terser').minify(require('fs').readFileSync('{}','utf8'),{collapseWhitespace:true,removeComments:true,minifyCSS:true,minifyJS:true,removeRedundantAttributes:true,useShortDoctype:true}).then(o=>require('fs').writeFileSync('{}',o))" \;

# ---- Stage 2: Runtime ---------------------------------------------
FROM nginx:1.27-alpine

LABEL maintainer="VOID <void@null.os>" \
      org.opencontainers.image.title="void-site" \
      org.opencontainers.image.description="VOID Showcase — Null Handler on the PURPCLAW Swarm" \
      org.opencontainers.image.source="https://null.os" \
      org.opencontainers.image.licenses="Proprietary-Classified"

RUN apk add --no-cache dumb-init curl

COPY nginx/nginx.conf /etc/nginx/nginx.conf

COPY --from=build /build/public/ /usr/share/nginx/html/

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://localhost/healthz || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["nginx", "-g", "daemon off;"]

EXPOSE 80
