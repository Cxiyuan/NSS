# Stage 1: Build client
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm i && rm -rf /root/.npm /root/.cache /tmp/*
COPY client/ ./
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine
WORKDIR /app

# Install runtime system dependencies (Chromium for Puppeteer)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
    && mkdir -p /app/data \
    && rm -rf /var/cache/apk/* /tmp/*

# Install Node.js dependencies (production only)
COPY package*.json ./
RUN npm i --omit=dev && rm -rf /root/.npm /root/.cache /tmp/*

# Copy application code
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server/index.js"]
