FROM node:16-alpine

RUN apk add --no-cache curl unzip

WORKDIR /home/app

copy package*.json ./

RUN npm ci --production

COPY . .

EXPOSE 8080

ENTRYPOINT ["node", "src/main.js"]