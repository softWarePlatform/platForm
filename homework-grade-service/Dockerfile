FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM build AS production-deps
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/uploads
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
RUN addgroup -S homework && adduser -S homework -G homework && mkdir -p /app/uploads && chown -R homework:homework /app
USER homework
EXPOSE 3002
CMD ["node", "dist/index.js"]
