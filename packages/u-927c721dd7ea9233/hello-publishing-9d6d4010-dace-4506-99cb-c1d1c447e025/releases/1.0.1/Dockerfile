FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json server.js ./
USER node
EXPOSE 3000
CMD ["npm", "start"]

# Documentation travels with the image.
COPY .marsl-package/ /usr/share/doc/marsl/
LABEL org.opencontainers.image.source="https://github.com/render-lab/made-with-marsl"
LABEL org.opencontainers.image.version="1.0.1"
LABEL dev.marsl.source-digest="7aecb89b807e492e136d528d867e538de08ad4d1ede838921f4ec0be05c7c71d"
LABEL dev.marsl.release-id="6ad29349-051b-41be-a929-f3b83b3a42f0"
