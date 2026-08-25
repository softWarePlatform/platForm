FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY backend/prisma ./prisma
COPY judge-worker/package.json judge-worker/tsconfig.json ./
RUN npm install --no-audit --fund=false
COPY judge-worker/src ./src
RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY backend/prisma ./prisma
COPY judge-worker/package.json ./
RUN npm install --omit=dev --no-audit --fund=false
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
RUN npx prisma generate --schema=./prisma/schema.prisma
CMD ["node", "dist/worker.js"]
