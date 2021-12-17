options.json
============

Here are all the options you can set in data/options.json

```json
{
    "archive_domain": "ifarchive.org",
    "cache": {
        "max_entries": 1000,
        "max_size": 1000000000
    },
    "cache-control-age": 604800,
    "domain": "localhost",
    "index": {
        "index_url": "https://ifarchive.org/indexes/Master-Index.xml",
        "recheck_period": 21600000
    },
    "nginx": {
        "cache" :{
            "keys_size": 50,
            "max_size": 1000
        }
    },
    "serve_proxy_pac": false,
    "subdomains": true
}
```

- archive_domain: (str) domain of the IF Archive to use for downloading files
- cache: options for the app's cache
  - max_entries: (int) number of zip files to cache
  - max_size: (int bytes) amount of disk to use for the cache
- cache-control-age: (int seconds) time to set for the Cache-Control header
- domain: (str) the main domain of the app
- index: options for the IF Archive index processor
  - index_url: (str) URL to Master-Index.xml
  - recheck_period: (int milliseconds) period to check if Master-Index.xml has changed
- nginx: nginx options
  - cache: nginx cache options
    - keys_size: (int MB) amount of RAM to use for cache keys
    - max_size: (int MB) amount of disk to use for the cache
- serve_proxy_pac: (bool) whether to serve a proxy.pac file
- subdomains: (bool) whether to use wildcard subdomains for unsafe files