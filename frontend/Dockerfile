# syntax=docker/dockerfile:1.7
# Government Template Platform V3.0 — Vite + React SPA.
#
# Гаралт нь ЦЭВЭР СТАТИК файлууд: build нь тэдгээрийг үүсгэж, nginx үйлчилнэ.
# Server талын код БАЙХГҮЙ тул нууц (client secret, токен) энэ дүрсэнд
# ХЭЗЭЭ Ч ордоггүй — API-тай харилцах бүхэн browser-аас ижил origin-оор явна.

# ---------- builder ----------
# Node 22 — CI (`.github/workflows/ci.yml`) болон backend-ийн дүрстэй ИЖИЛ.
# Зөрүүтэй байвал CI ногоон атлаа дүрсийн build унах (эсвэл эсрэгээр) боломжтой.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runner
# SPA-ийн статик файлууд.
COPY --from=builder /app/dist /usr/share/nginx/html
# Контейнер доторх nginx: SPA fallback + /api проксиг гаднах nginx хийдэг тул
# энд зөвхөн статик үйлчилгээ (хамгийн бага гадаргуу).
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Аюулгүй байдлын толгойнууд — location бүрээс include хийгддэг (nginx-ийн
# add_header ӨВЛӨГДДӨГГҮЙ тул нэг эх сурвалжаас).
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
