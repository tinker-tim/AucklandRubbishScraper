## Builder stage: install dev deps and build TypeScript
FROM node:20 AS builder
WORKDIR /app

# install all deps (including dev) for build
COPY package.json package-lock.json* ./
RUN npm ci

# copy source and build
COPY . .
RUN npm run build

## Runtime stage: smaller image with only production deps and built artifacts
FROM node:20-slim
WORKDIR /app

# install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --production

# copy built files from builder
COPY --from=builder /app/dist ./dist

# ensure data dir exists
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8000

CMD ["node", "dist/index.js"]
