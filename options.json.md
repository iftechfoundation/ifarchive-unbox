options.json
============

Here are all the options you can set in data/options.json

```json
{
    "archive_domain": "ifarchive.org",
    "cache": {
        "max_buffer": 20000000,
        "max_entries": 1000,
        "max_size": 1000000000
    },
    "cache-control-age": 604800,
    "certbot": {
        "email": "user@domain.com",
        "renew_time": 720,
        "test": true,
    },
    "domain": "localhost",
    "https": false,
    "index": {
        "index_url": "https://ifarchive.org/indexes/Master-Index.xml",
        "recheck_period": 21600000
    },
    "nginx": {
        "cache" :{
            "keys_size": 50,
            "max_size": 1000
        },
        "reload_time": 360
    },
    "serve_proxy_pac": false,
    "subdomains": true
}
```

Note that if you want to set one of the object options, you may need to include all sub-options, not just the one you want to change.

- archive_domain: (str) domain of the IF Archive to use for downloading files
- cache: options for the app's cache
  - max_buffer: (int bytes) buffer size to use when extracting to RAM
  - max_entries: (int) number of zip files to cache
  - max_size: (int bytes) amount of disk to use for the cache
- cache-control-age: (int seconds) time to set for the Cache-Control header
- certbot: options for certbot
  - email: (str) email address for certbot notifications (required for HTTPS)
  - rewew_time: (int minutes) period to rewew certificate
  - test: (bool) obtain a test certificate from the Let's Encrypt staging server
- domain: (str) the main domain of the app
- https: (bool) whether to enable HTTPS
- index: options for the IF Archive index processor
  - index_url: (str) URL to Master-Index.xml
  - recheck_period: (int milliseconds) period to check if Master-Index.xml has changed
- nginx: nginx options
  - cache: nginx cache options
    - keys_size: (int MB) amount of RAM to use for cache keys
    - max_size: (int MB) amount of disk to use for the cache
  - reload_time: (int minutes) period to reload nginx (to check for certificate changes)
- serve_proxy_pac: (bool) whether to serve a proxy.pac file
- subdomains: (bool) whether to use wildcard subdomains for unsafe files