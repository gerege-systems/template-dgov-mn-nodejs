# syntax=docker/dockerfile:1.7
#
# Government Template Platform V3.0 — Node.js API image.
#
# Multi-stage, multi-arch. BUILDPLATFORM / TARGETPLATFORM are set by
# `docker buildx` when building for linux/amd64 + linux/arm64; a plain
# `docker build` still works because they default to the local platform.
#
# Бүх runtime хамаарал нь ЦЭВЭР JavaScript (pg · ioredis · bcryptjs ·
# prom-client · ssh2) тул native build (node-gyp) шаардлагагүй — иймээс runtime
# нь distroless байж чадна: shell ч, package manager ч байхгүй.

# ---------- deps: production хамаарлууд ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
# `npm ci --omit=dev` нь lock файлыг ЯГ дагана (reproducible build).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# ---------- builder: TypeScript → JavaScript ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------- runtime ----------
# Distroless nodejs: shell ч, package manager ч байхгүй, nonroot хэрэглэгч шууд
# байна. apk-ийн халдлагын гадаргуу болон patch хийх ажил алга.
FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps    /app/node_modules /app/node_modules
COPY --from=builder /app/dist         /app/dist
COPY package.json ./
# Migration runner нь SQL-ийг өөрийн CWD (/app)-аас харьцангуйгаар уншина;
# файлууд repo-ийн backend/migrations/ дор байрладаг.
COPY migrations /app/migrations

EXPOSE 8080

# Distroless-д зориулсан container-түвшний readiness probe — /health руу хүрдэг
# жижиг Node script (curl/wget шаардахгүй).
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD ["/nodejs/bin/node", "/app/dist/cmd/healthcheck/main.js"]

# Distroless-ийн ENTRYPOINT нь аль хэдийн `node` тул CMD нь script-ийн зам.
CMD ["/app/dist/cmd/api/main.js"]
