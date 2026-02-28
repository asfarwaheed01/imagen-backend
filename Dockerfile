FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

RUN ls -la dist/

RUN npm prune --production

EXPOSE 8080

CMD ["node", "dist/index.js"]