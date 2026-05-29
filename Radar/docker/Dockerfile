# Stage 1: Build client
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm i
COPY client/ ./
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm i --omit=dev

COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
    && echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser" > .env

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server/index.js"]
