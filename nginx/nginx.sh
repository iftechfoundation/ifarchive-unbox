#!/bin/sh

CONF_FILE=/etc/nginx/conf.d/default.conf
OPTIONS_FILE=$DATA_DIR/options.json

# Get values from options.json
if [ -f "$OPTIONS_FILE" ]; then
    DOMAIN=$(jq -r '.domain? // ""' $OPTIONS_FILE)
    HTTPS=$(jq -r '.https? // false' $OPTIONS_FILE)
    KEYS_SIZE=$(jq -r '.nginx?.cache?.keys_size? // 50' $OPTIONS_FILE)
    MAX_SIZE=$(jq -r '.nginx?.cache?.max_size? // 1000' $OPTIONS_FILE)
    RELOAD_TIME=$(jq -r '.nginx?.reload_time? // 360' $OPTIONS_FILE)
    SUBDOMAINS=$(jq -r '.subdomains? // false' $OPTIONS_FILE)
    SUPPORT_BYPASS=$(jq -r '.nginx?.cache?.support_bypass? // false' $OPTIONS_FILE)
fi

# Common gzip settings
GZIP="gzip on;
    gzip_proxied any;
    gzip_types *;"

# Default listen settings
LISTEN="listen 80;
    listen [::]:80;"

# Erase the conf file
> $CONF_FILE

# Handle HTTPS
if [ -n "$DOMAIN" ]; then
    SERVER_NAME="server_name $DOMAIN;"

    # See if we're ready for HTTPS
    CERT_DIR=$DATA_DIR/certbot/live/$DOMAIN
    if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
        HTTPS="false"
    fi
    if [ "$HTTPS" = "true" ]; then
        LISTEN="listen 443 ssl;
    listen [::]:443 ssl;"

        SSL="ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;"

        cat >> $CONF_FILE <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN *.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}
EOF
    fi
fi

# Top domain server
cat >> $CONF_FILE <<EOF
server {
    $LISTEN
    $SERVER_NAME
    $SSL
    $GZIP

    location / {
        proxy_pass http://app:8080;
        proxy_set_header Host \$host;
    }
}
EOF

if [ -n "$DOMAIN" ] && [ "$SUBDOMAINS" = "true" ]; then

CACHE_DIR="$DATA_DIR/nginx-cache"
mkdir -p $CACHE_DIR

if [ "$SUPPORT_BYPASS" = "true" ]; then
    BYPASS="proxy_cache_bypass \$http_pragma;"
fi

# Subdomain server
cat >> $CONF_FILE <<EOF

proxy_cache_path $CACHE_DIR keys_zone=cache:${KEYS_SIZE}m levels=1:2 max_size=${MAX_SIZE}m;

server {
    $LISTEN
    server_name *.${DOMAIN};
    $SSL
    $GZIP
    proxy_cache cache;
    proxy_cache_valid 301 365d;
    proxy_cache_valid any 1d;
    $BYPASS

    location / {
        proxy_pass http://app:8080;
        proxy_set_header Host \$host;
        add_header X-Cache \$upstream_cache_status;
    }
}
EOF

fi;

# Log the contructed config file
echo Constructed $CONF_FILE
cat $CONF_FILE

# Periodically restart the server if in HTTPS mode
if [ "$HTTPS" = "true" ]; then
    trap exit TERM
    while :; do
        sleep ${RELOAD_TIME}m & wait ${!}
        echo Restarting Nginx
        nginx -s reload
    done &
fi

# Invoke the Nginx image's startup script
/docker-entrypoint.sh "$@"