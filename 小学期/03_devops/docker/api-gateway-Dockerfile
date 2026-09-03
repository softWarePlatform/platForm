FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM build AS production-deps
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN addgroup -S gateway && adduser -S gateway -G gateway && chown -R gateway:gateway /app
USER gateway
EXPOSE 3081
CMD ["node", "dist/index.js"]
