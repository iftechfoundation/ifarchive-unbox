#!/bin/sh

CREDENTIALS_FILE=$DATA_DIR/credentials.ini
OPTIONS_FILE=$DATA_DIR/options.json

# Check that credentials.ini and options.json both exist
if [ ! -f "$CREDENTIALS_FILE" ] || [ ! -f "$OPTIONS_FILE" ]; then
    echo HTTPS not enabled
    sleep infinity
    exit
fi

DOMAIN=$(jq -r '.domain? // ""' $OPTIONS_FILE)
EMAIL=$(jq -r '.certbot?.email? // ""' $OPTIONS_FILE)
HTTPS=$(jq -r '.https? // false' $OPTIONS_FILE)
RENEW_TIME=$(jq -r '.certbot?.renew_time? // 720' $OPTIONS_FILE)
TEST_MODE=$(jq -r '.certbot?.test? // false' $OPTIONS_FILE)

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ] || [ "$HTTPS" = "false" ]; then
    echo HTTPS not enabled
    sleep infinity
    exit
fi

if [ "$TEST_MODE" = "true" ]; then
    TEST="--staging --test-cert"
fi

CMD="certbot \
    certonly \
    --agree-tos \
    -d $DOMAIN -d *.$DOMAIN \
    --dns-cloudflare \
    --dns-cloudflare-credentials $CREDENTIALS_FILE \
    --keep \
    -m $EMAIL \
    --non-interactive \
    $TEST"

echo $CMD

trap exit TERM
while :; do
    $CMD
    sleep ${RENEW_TIME}m & wait ${!}
done