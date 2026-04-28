FROM node:20-alpine

WORKDIR /app

# Install python + build tools (for node-gyp)
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]