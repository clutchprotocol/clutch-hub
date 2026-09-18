# Build from the repo root, which is the npm workspace root:
#   docker build -f apps/demo/Dockerfile .
#
# Before the repos were merged this file copied two sibling checkouts and ran two separate
# installs, because the demo depended on the SDK as `file:../clutch-hub-sdk-js`. Now both are
# workspaces of one root, so there is one lockfile and one install.
FROM node:20-slim AS builder

WORKDIR /build

COPY package.json package-lock.json ./
COPY packages/sdk packages/sdk
COPY apps/demo apps/demo

RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 600000 && \
    npm ci

# The SDK's `prepare` already builds it during `npm ci`. Doing it again explicitly costs one
# `tsc` run and removes the dependency on that lifecycle hook firing, because the demo's vite
# alias resolves to packages/sdk and a missing dist/ there fails as a bare import error.
RUN npm run build --workspace=clutch-hub-sdk-js

ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build --workspace=clutch-hub-demo-app

# Serve stage
FROM nginx:alpine

COPY --from=builder /build/apps/demo/dist /usr/share/nginx/html
COPY apps/demo/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
