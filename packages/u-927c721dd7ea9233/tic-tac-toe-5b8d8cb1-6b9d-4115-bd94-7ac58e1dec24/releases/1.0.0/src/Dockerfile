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
