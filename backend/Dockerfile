FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
  npm ci --ignore-scripts --no-audit --fund=false --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
RUN --mount=type=cache,target=/root/.cache/prisma \
  npx --no-install prisma generate --schema=prisma/schema.prisma --generator client
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/uploads
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --ignore-scripts --no-audit --fund=false --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/uploads
EXPOSE 3000
CMD ["node", "dist/index.js"]
