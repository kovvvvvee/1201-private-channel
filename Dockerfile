FROM node:18-alpine

WORKDIR /app

COPY server/ ./server/

WORKDIR /app/server

RUN npm install

EXPOSE 3001

CMD ["node", "index.js"]