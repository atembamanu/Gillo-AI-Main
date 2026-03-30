FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install || true

COPY tsconfig.json ./
COPY src ./src
RUN npm run build || true

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev || true

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/worker.js"]

