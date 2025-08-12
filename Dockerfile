# Build stage
FROM node:18 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage with Chrome installed, minimal size
FROM node:18-slim AS runtime

ENV NODE_ENV=production
# Install Chrome and xvfb (no recommends to reduce size)
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget gnupg ca-certificates xvfb \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux-signing-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/google-linux-signing-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

ENV WECHATY_PUPPET_WECHAT_ENDPOINT=/usr/bin/google-chrome
WORKDIR /app

# Only copy production dependencies and dist
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY config.yaml.example ./

# Run compiled JS instead of ts-node/nodemon
CMD xvfb-run --server-args="-screen 0 1280x800x24 -ac -nolisten tcp -dpi 96 +extension RANDR" node dist/main.js