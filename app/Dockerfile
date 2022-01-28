FROM ubuntu:20.04

RUN apt-get update && \
    apt-get install -y curl locales unzip ncompress && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/* && \
    localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8

ENV LANG en_US.UTF-8

WORKDIR /home/app

COPY package*.json ./

RUN npm ci --production

COPY . .

ENTRYPOINT ["node", "src/main.js"]