FROM python:3.13.11-bookworm@sha256:b3ad23176613a34fcd715a28da314a0cbbd230dcc68798efb80ec30292b2a683 AS yt-dlp-build

ARG YT_DLP_BASE_VERSION=2026.03.13
ARG YT_DLP_COMMIT=990fdf36dd985403cb171e4b92d1d7f01a4e273d
ENV SOURCE_DATE_EPOCH=1773391500 \
    PYTHONHASHSEED=0

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --filter=blob:none --no-checkout https://github.com/yt-dlp/yt-dlp.git /src/yt-dlp \
 && git -C /src/yt-dlp checkout --detach "${YT_DLP_COMMIT}" \
 && test "$(git -C /src/yt-dlp rev-parse HEAD)" = "${YT_DLP_COMMIT}" \
 && test "$(cat /src/yt-dlp/yt_dlp/version.py | grep -F "__version__ = '${YT_DLP_BASE_VERSION}'")" != ""

COPY worker/acquisition/yt-dlp-token-observation.patch /src/yt-dlp-token-observation.patch
COPY worker/acquisition/yt-dlp-build-requirements.lock /src/yt-dlp-build-requirements.lock
RUN git -C /src/yt-dlp apply --check /src/yt-dlp-token-observation.patch \
 && git -C /src/yt-dlp apply /src/yt-dlp-token-observation.patch \
 && git -C /src/yt-dlp diff --check \
 && python -m pip install --no-cache-dir --require-hashes --no-deps --requirement /src/yt-dlp-build-requirements.lock \
 && cd /src/yt-dlp \
 && python devscripts/make_lazy_extractors.py \
 && python -m bundle.pyinstaller

FROM node:24.16.0-bookworm-slim AS build

ARG YT_DLP_VERSION=2026.03.13
ARG YOUTUBE_PLAYER_CLIENT=mweb
ARG YOUTUBE_PLAYER_CLIENT_TELEMETRY=MWEB
ARG YOUTUBE_FORMAT_SELECTOR=bv*+ba/b
ARG YOUTUBE_DOWNLOADER=

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./tsconfig.json
COPY scripts/copyRuntimeDependencyClosure.mjs ./scripts/copyRuntimeDependencyClosure.mjs
COPY lib/server ./lib/server
COPY lib/urlAcquisition ./lib/urlAcquisition
COPY worker/acquisition ./worker/acquisition
RUN ./node_modules/.bin/tsc -p worker/acquisition/tsconfig.json \
 && sed -i "s/2026\\.03\\.13/${YT_DLP_VERSION}/g" worker/acquisition/dist/lib/server/packagedYtDlp.js \
 && sed -i "s/youtube:player_client=mweb/youtube:player_client=${YOUTUBE_PLAYER_CLIENT}/g" worker/acquisition/dist/lib/server/acquisitionWorker/youtubeAdapter.js \
 && sed -i "s/\"MWEB\"/\"${YOUTUBE_PLAYER_CLIENT_TELEMETRY}\"/g" worker/acquisition/dist/lib/server/acquisitionWorker/telemetry.js \
 && sed -i "s#\"bv\\*+ba/b\"#\"${YOUTUBE_FORMAT_SELECTOR}\"#g" worker/acquisition/dist/lib/server/youtubeIngestion.js \
 && if [ -n "${YOUTUBE_DOWNLOADER}" ]; then \
      sed -i "s#\"--merge-output-format\"#\"--downloader\", \"${YOUTUBE_DOWNLOADER}\", \"--merge-output-format\"#" worker/acquisition/dist/lib/server/youtubeIngestion.js; \
    fi \
 && grep -F "${YT_DLP_VERSION}" worker/acquisition/dist/lib/server/packagedYtDlp.js \
 && grep -F "youtube:player_client=${YOUTUBE_PLAYER_CLIENT}" worker/acquisition/dist/lib/server/acquisitionWorker/youtubeAdapter.js \
 && grep -F "\"${YOUTUBE_PLAYER_CLIENT_TELEMETRY}\"" worker/acquisition/dist/lib/server/acquisitionWorker/telemetry.js \
 && grep -F "\"${YOUTUBE_FORMAT_SELECTOR}\"" worker/acquisition/dist/lib/server/youtubeIngestion.js \
 && if [ -n "${YOUTUBE_DOWNLOADER}" ]; then \
      grep -F "\"--downloader\", \"${YOUTUBE_DOWNLOADER}\"" worker/acquisition/dist/lib/server/youtubeIngestion.js; \
    else \
      ! grep -F "\"--downloader\"" worker/acquisition/dist/lib/server/youtubeIngestion.js; \
    fi \
 && node scripts/copyRuntimeDependencyClosure.mjs /src/node_modules /runtime-node-modules google-auth-library @google-cloud/storage

FROM node:24.16.0-bookworm-slim AS runtime

ARG YT_DLP_VERSION=2026.03.13
ARG BGUTIL_PLUGIN_VERSION=1.3.1
ARG BGUTIL_PLUGIN_SHA256=b8ceec7f76143da172aaf5ebeec0c2d218e5680c063b931586bca48567069b38

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 worker \
 && useradd --system --uid 10001 --gid worker --create-home worker

WORKDIR /app
COPY --from=build /src/worker/acquisition/dist ./dist
COPY --from=build /runtime-node-modules ./node_modules
COPY --from=build /src/node_modules/ffmpeg-static/ffmpeg /app/node_modules/.nexcut-runtime/ffmpeg/ffmpeg

RUN mkdir -p /app/node_modules/.nexcut-runtime/yt-dlp /home/worker/.config/yt-dlp/plugins /workspace/acquisitions
COPY --from=yt-dlp-build /src/yt-dlp/dist/yt-dlp_linux /app/node_modules/.nexcut-runtime/yt-dlp/yt-dlp
RUN /app/node_modules/.nexcut-runtime/yt-dlp/yt-dlp --version | grep -Fx "${YT_DLP_VERSION}" \
 && curl --fail --location --silent --show-error \
      "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_PLUGIN_VERSION}/bgutil-ytdlp-pot-provider.zip" \
      --output /home/worker/.config/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip \
 && echo "${BGUTIL_PLUGIN_SHA256}  /home/worker/.config/yt-dlp/plugins/bgutil-ytdlp-pot-provider.zip" | sha256sum --check --strict \
 && chmod 0755 /app/node_modules/.nexcut-runtime/yt-dlp/yt-dlp /app/node_modules/.nexcut-runtime/ffmpeg/ffmpeg \
 && chown -R worker:worker /home/worker /workspace/acquisitions /app

ENV NODE_ENV=production \
    HOME=/home/worker \
    ACQUISITION_WORKSPACE_ROOT=/workspace/acquisitions

USER 10001:10001
EXPOSE 8080
CMD ["node", "/app/dist/worker/acquisition/bootstrap.js"]

FROM runtime AS experiment-control
CMD ["node", "/app/dist/worker/acquisition/experimentControlBootstrap.js"]

FROM runtime AS production
