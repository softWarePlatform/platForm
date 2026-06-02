FROM node:20-alpine AS fe
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --fund=false || npm install --no-audit --fund=false
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=fe /app/dist /usr/share/nginx/html
