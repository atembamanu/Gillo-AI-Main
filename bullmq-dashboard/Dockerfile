FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY server.js ./

EXPOSE 3010
CMD ["npm", "start"]
