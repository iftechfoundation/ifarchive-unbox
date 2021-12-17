FROM nginx:mainline-alpine

RUN apk add --no-cache jq

WORKDIR /home/nginx

COPY . .

ENTRYPOINT ["./nginx.sh"]