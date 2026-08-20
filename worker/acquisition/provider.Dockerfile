FROM node:24.16.0-bookworm-slim AS source

ARG BGUTIL_COMMIT=7608dd51ee813b48cf9a6d68c6e42cb197ce10e0
ARG BGUTIL_SOURCE_SHA256=5d4c54f9c5e75f3dcb48c906a5f8b860f57ee125b83f025e43362ab332695c3e

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /source
RUN curl --fail --location --silent --show-error \
      "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/${BGUTIL_COMMIT}.tar.gz" \
      --output source.tar.gz \
 && echo "${BGUTIL_SOURCE_SHA256}  source.tar.gz" | sha256sum --check --strict \
 && tar --extract --gzip --file source.tar.gz --strip-components=2 \
      "bgutil-ytdlp-pot-provider-${BGUTIL_COMMIT}/server"

FROM node:24.16.0-bookworm-slim AS install
USER node
WORKDIR /app
COPY --from=source --chown=node:node /source/package.json /source/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM install AS build
RUN npm ci --no-audit --no-fund
COPY --from=source --chown=node:node /source/types ./types
COPY --from=source --chown=node:node /source/tsconfig.json ./
COPY --from=source --chown=node:node /source/src ./src
RUN ./node_modules/.bin/tsc

FROM install AS runtime
COPY --from=build --chown=node:node /app/build ./build
USER node
EXPOSE 4416
ENTRYPOINT ["/usr/local/bin/node", "build/main.js"]
