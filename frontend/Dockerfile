FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install || true

COPY . .

# Production: pass VITE_API_BASE_URL at build time (e.g. https://api.gilloai.com)
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build || true

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

