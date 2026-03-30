FROM node:22-alpine AS builder
WORKDIR /app

COPY backend/package.json ./
RUN npm install || true

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build || true

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/notes

COPY backend/package.json ./
RUN npm install --omit=dev || true

COPY backend/prisma ./prisma

# Generate Prisma client so `prisma migrate` works immediately.
RUN npx prisma generate --schema prisma/schema.prisma || true

COPY --from=builder /app/dist ./dist

# Python seed script (ops): docker exec -it <container> python /app/scripts/seed_initial_data.py
COPY scripts /app/scripts
RUN apk add --no-cache python3 py3-pip \
  && pip3 install --no-cache-dir --break-system-packages -r /app/scripts/requirements-seed.txt

EXPOSE 3000
CMD ["node", "dist/index.js"]
