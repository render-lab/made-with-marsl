FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json server.js ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Documentation travels with the image.
COPY .marsl-package/ /usr/share/doc/marsl/
LABEL org.opencontainers.image.source="https://github.com/render-lab/made-with-marsl"
LABEL org.opencontainers.image.version="1.0.0"
LABEL dev.marsl.source-digest="5349cad14a20dffe5bc15de0c5cbad96d7fc59f7614952de26045c84e780c57d"
LABEL dev.marsl.release-id="0ed89854-9197-44a0-b78b-f58a4b0cc2f3"
