FROM node:20-alpine

WORKDIR /app

# No dependencies to install — the server uses only Node built-ins.
COPY package.json ./
COPY server.js ./
COPY public ./public

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
