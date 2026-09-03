FROM node:24-alpine AS build
WORKDIR /app

COPY lab-practice-service/package.json lab-practice-service/package-lock.json ./lab-practice-service/
COPY lab-practice-service/prisma ./lab-practice-service/prisma
RUN --mount=type=cache,target=/root/.npm \
  npm ci --prefix lab-practice-service --ignore-scripts --no-audit --fund=false

COPY lab-practice-service/src ./lab-practice-service/src
COPY lab-practice-service/tsconfig.json ./lab-practice-service/tsconfig.json
RUN npm run postinstall --prefix lab-practice-service
RUN npm run build --prefix lab-practice-service

FROM node:24-alpine AS runtime
WORKDIR /app/lab-practice-service
ENV NODE_ENV=production
ENV PORT=3003
ENV UPLOAD_DIR=/app/uploads

COPY lab-practice-service/package.json lab-practice-service/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --ignore-scripts --no-audit --fund=false
COPY --from=build /app/lab-practice-service/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/lab-practice-service/node_modules/@lab ./node_modules/@lab
COPY --from=build /app/lab-practice-service/dist ./dist

RUN mkdir -p /app/uploads
EXPOSE 3003
CMD ["node", "dist/lab-practice-service/src/index.js"]
