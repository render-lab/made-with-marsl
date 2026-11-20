# Surface Tic-Tac-Toe — static Three.js game served by nginx.
#
#   docker build -t surface-tic-tac-toe .
#   docker run --rm -p 8080:8080 surface-tic-tac-toe
#
# The container listens on $PORT (default 8080) and answers /health with "ok".

# ---- build stage: install exact deps from package-lock.json, type-check and bundle ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: serve dist/ only ----
FROM nginx:1.27-alpine
ENV PORT=8080
# The official nginx image renders /etc/nginx/templates/*.template with envsubst at start-up.
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

# Documentation travels with the image.
COPY .marsl-package/ /usr/share/doc/marsl/
LABEL org.opencontainers.image.source="https://github.com/render-lab/made-with-marsl"
LABEL org.opencontainers.image.version="1.0.0"
LABEL dev.marsl.source-digest="549bc0dddad3221cccbf2fd0f4f381b2cb4384cc44bfaae53321f26be3e5e2ed"
LABEL dev.marsl.release-id="24068a5a-90f5-4682-bef8-74ba0fc1f713"
