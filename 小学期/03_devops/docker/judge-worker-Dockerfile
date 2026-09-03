FROM node:24-bookworm-slim AS build
RUN apt-get -o Acquire::Retries=3 update \
  && apt-get -o Acquire::Retries=3 install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/prisma ./prisma
COPY judge-worker/package.json judge-worker/package-lock.json* judge-worker/tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --ignore-scripts --no-audit --fund=false --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY judge-worker/src ./src
RUN --mount=type=cache,target=/root/.cache/prisma \
  npx --no-install prisma generate --schema=./prisma/schema.prisma --generator client
RUN npm run build

FROM node:24-bookworm-slim AS runtime
RUN apt-get -o Acquire::Retries=3 update \
  && apt-get -o Acquire::Retries=3 install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/uploads
COPY backend/prisma ./prisma
COPY judge-worker/package.json judge-worker/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --ignore-scripts --no-audit --fund=false --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
RUN groupadd --system judge \
  && useradd --system --gid judge --home-dir /app judge \
  && mkdir -p /app/uploads \
  && chown -R judge:judge /app
USER judge
CMD ["node", "dist/worker.js"]
