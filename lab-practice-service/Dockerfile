FROM node:24-alpine AS build
WORKDIR /app

COPY lab-practice-service/package.json ./lab-practice-service/package.json
COPY backend/prisma ./backend/prisma
RUN --mount=type=cache,target=/root/.npm \
  npm install --prefix lab-practice-service --ignore-scripts --no-audit --fund=false \
  && ln -s /app/lab-practice-service/node_modules /app/backend/node_modules

COPY backend/src ./backend/src
COPY lab-practice-service/src ./lab-practice-service/src
COPY lab-practice-service/tsconfig.json ./lab-practice-service/tsconfig.json
RUN npm exec --prefix lab-practice-service -- prisma generate --schema=../backend/prisma/schema.prisma
RUN npm run build --prefix lab-practice-service

FROM node:24-alpine AS runtime
WORKDIR /app/lab-practice-service
ENV NODE_ENV=production
ENV PORT=3001
ENV UPLOAD_DIR=/app/uploads

COPY lab-practice-service/package.json ./package.json
RUN --mount=type=cache,target=/root/.npm \
  npm install --omit=dev --ignore-scripts --no-audit --fund=false
COPY --from=build /app/lab-practice-service/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/lab-practice-service/dist ./dist

RUN mkdir -p /app/uploads
EXPOSE 3001
CMD ["node", "dist/lab-practice-service/src/index.js"]
