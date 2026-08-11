FROM node:20-slim AS yt-dlp

ARG YT_DLP_VERSION=2026.03.13
ARG YT_DLP_SHA256=52699d7b103803ef37442a52b429f02d4a41b8821fb6ac9c564f7a16056258d3

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    python3 \
    && curl --fail --location --proto '=https' --tlsv1.2 \
      "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" \
      -o /usr/local/bin/yt-dlp \
    && echo "${YT_DLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum -c - \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && test "$(yt-dlp --version)" = "${YT_DLP_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

FROM node:20-slim AS dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS builder

COPY . .
RUN npm run build

FROM node:20-slim AS production-dependencies

ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=yt-dlp /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT:-3000}"]
