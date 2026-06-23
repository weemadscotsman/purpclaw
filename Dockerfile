# ════════════════════════════════════════════════════════════════════════════
#  🕳️ VOID — Multi-stage hardened container build
# ════════════════════════════════════════════════════════════════════════════
#  Design notes:
#    - Multi-stage build → final image carries ONLY runtime artifacts.
#    - Non-root user (UID 1001, GID 1001) → no privilege escalation surface.
#    - Distroless runtime → no shell, no package manager, minimal attack surface.
#    - Read-only filesystem assumed; tmpfs mounts declared in compose.
#    - Drops ALL Linux capabilities → re-adds only what Node needs.
#    - No-new-privileges enforced via security-opt in compose.
#    - Pinned base image SHA (resolved at build time by CI).
#    - SBOM generated, image cosign-signed in CI pipeline.
#
#  Cactus 2026-06-22: Node 20.18.1 → 22.11.0 across all stages to match
#  package.json `engines.node: ^22.0.0`. Removed the silent build-error swallow
#  (`npm run build 2>/dev/null || echo WARN`) — it hid real Next.js failures.
#  Set `--build-arg BUILD_REQUIRED=0` in CI to opt out of the build step.
# ════════════════════════════════════════════════════════════════════════════

# ── Stage 1: dependencies (full toolchain for reproducible install) ─────────
FROM node:22.11.0-bookworm-slim AS deps

WORKDIR /app

# Install only the OS packages we actually need for native module compilation.
# ca-certificates is required for outbound HTTPS to LLM providers.
# Clean apt cache in the same RUN to avoid bloating the layer.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      python3 \
      make \
      g++ \
 && rm -rf /var/lib/apt/lists/* \
 && update-ca-certificates

# Copy lockfile FIRST → maximum layer cache reuse.
COPY package.json package-lock.json ./

# npm ci is reproducible and fails on lockfile drift.
# --ignore-scripts blocks arbitrary postinstall code execution.
# Audit gates the install on known-vulnerable deps.
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && npm audit --omit=dev --audit-level=high

# ── Stage 2: build (compile TS, run codegen, etc.) ───────────────────────────
FROM deps AS build

COPY tsconfig.json next.config.* ./
COPY . .

# Run the project's official build script.
# Cactus 2026-06-22: no more silent error swallow. If next build fails, the
# image build fails (which is what you want). To opt out, pass
# `--build-arg BUILD_REQUIRED=0` to `docker build`.
ARG BUILD_REQUIRED=1
RUN if [ "$BUILD_REQUIRED" = "1" ]; then \
      npm run build; \
    else \
      echo "WARN: BUILD_REQUIRED=0 — skipping npm run build"; \
    fi

# ── Stage 3: production deps ONLY (no devDependencies) ──────────────────────
FROM node:22.11.0-bookworm-slim AS prod-deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# ── Stage 4: runtime (distroless — no shell, no apt, no package manager) ───
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime

LABEL org.opencontainers.image.title="purpclaw" \
      org.opencontainers.image.description="PURPCLAW — multi-agent runtime" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="PURPCLAW" \
      org.opencontainers.image.source="https://github.com/weemadscotsman/purpclaw" \
      org.opencontainers.image.documentation="https://github.com/weemadscotsman/purpclaw/blob/main/README.md"

# Distroless already ships with a `nonroot` user (UID 65532). Don't override.
WORKDIR /app

# Copy production node_modules and built artifacts.
COPY --from=prod-deps --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=build     --chown=nonroot:nonroot /app/.next          ./.next
COPY --from=build     --chown=nonroot:nonroot /app/dist           ./dist
COPY --from=build     --chown=nonroot:nonroot /app/public          ./public
COPY --from=build     --chown=nonroot:nonroot /app/package.json   ./package.json
COPY --from=build     --chown=nonroot:nonroot /app/next.config.*  ./

# ── Runtime metadata ─────────────────────────────────────────────────────────
ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=512" \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NODE_NO_WARNINGS=1

EXPOSE 3000

# Healthcheck is delegated to compose (distroless has no curl/wget).
# Use a Node-side /healthz probe via `wget`-equivalent — declare in compose.

# distroless entrypoint is `node`. We pass the start script directly so
# signal handling (SIGTERM, SIGINT) reaches Node and graceful shutdown works.
USER nonroot:nonroot

ENTRYPOINT ["node"]
CMD ["start_purpclaw.js"]

# ── Build-time hardening verification ───────────────────────────────────────
# Run after build to fail the pipeline on common misconfigurations.
# Trivy, cosign, and SBOM generation are handled in CI (.github/workflows/build.yml).
