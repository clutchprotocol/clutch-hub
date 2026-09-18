# Build from the Clutch monorepo root (so clutch-hub-sdk-js is available as file:../clutch-hub-sdk-js):
#   docker build -f clutch-hub-demo-app/Dockerfile .
FROM node:20-slim AS builder

WORKDIR /build
COPY clutch-hub-sdk-js ./clutch-hub-sdk-js

# Build SDK first (prepare script needs tsc from devDependencies)
WORKDIR /build/clutch-hub-sdk-js
RUN npm ci && npm run build

WORKDIR /build/clutch-hub-demo-app
COPY clutch-hub-demo-app/package*.json ./
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 600000 && \
    npm ci

COPY clutch-hub-demo-app/ .
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Serve stage
FROM nginx:alpine

COPY --from=builder /build/clutch-hub-demo-app/dist /usr/share/nginx/html
COPY clutch-hub-demo-app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
