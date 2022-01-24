IF Archive Unboxing Service
===========================

The Unbox service allows users to view the contents of `zip` and `tar.gz` packages on the [IF Archive][ifarch]. For browser games (such as zipped Twine games), this is all that's needed to make them directly playable.

Unbox also allows web interpreters (such as [iplayif.com][iplayif]) to play `zip`ped-up game files.

[ifarch]: https://ifarchive.org/
[iplayif]: https://iplayif.com/

## What's going on?

Visit the front page of Unbox and enter an Archive URL in the input field. For the sake of example, we will use the URL `https://ifarchive.org/if-archive/games/twine/Absent_Heroes.zip`.

This must be the URL of a `zip` or `tar.gz` on the IF Archive. (`http:` and `https:` URLs are both accepted, since they give the same result. You may also omit the domain and enter an absolute path URI: `/if-archive/games/twine/Absent_Heroes.zip`.)

Unbox now shows you a [list of the package contents][exlist]:

- [anigif_excited-ron-6869-1311881136-43.gif][exron]
- [cara.css][excara]
- [index.html][exindex]
- [kirk-ag-article.jpg][exkirk]

[exlist]: https://unbox.ifarchive.org/?url=https%3A%2F%2Fifarchive.org%2Fif-archive%2Fgames%2Ftwine%2FAbsent_Heroes.zip
[exindex]: https://1u3qlfmqda.unbox.ifarchive.org/1u3qlfmqda/index.html
[exkirk]: https://unbox.ifarchive.org/1u3qlfmqda/kirk-ag-article.jpg
[excara]: https://unbox.ifarchive.org/1u3qlfmqda/cara.css
[exron]: https://unbox.ifarchive.org/1u3qlfmqda/anigif_excited-ron-6869-1311881136-43.gif

Click on `index.html` to launch the Twine game. You can also view the images or the CSS file, if you so desire.

Note that `index.html` links to a subdomain of `unbox.ifarchive.org`. Each Archive path gets a unique subdomain (via a hash function). This ensures that games cannot wrangle each other's cookies or other stored data.

Only HTML and SVG files get the subdomain treatment. These are the only formats that can include live scripting. All other files are considered media files; they are served from the main `unbox.ifarchive.org` domain. Requests for HTML/SVG in the main domain, and requests for media files in the subdomain, are redirected to the proper destination.

Why this dual treatment? We want to use a CDN (Cloudflare) to cache large files and protect us against high traffic. However, CDNs are normally configured for a single domain at a time. Happily, we can divide our files into media (large, safe to keep on a common domain) and HTML/SVG (small, must be kept in subdomains). The CDN caches media files. HTML/SVG files are cached by an `nginx` process running on the Unbox server.

## Details

In production, Unbox consists of three layers:

- `ifarchive-unbox` is the app itself. It maintains a cache of `zip/tar.gz` files downloaded from [ifarchive.org][ifarch]. It also keeps a local copy of the Archive's `Master-Index.xml` file.
- `nginx` is a caching web server that runs in front of `ifarchive-unbox`. This caches HTML/SVG files.
- A CDN such as CloudFlare is configured in front of `nginx`. This handles caching of media files.

This repository sets up the first two layers. The CDN must be set up separately.

(You can run Unbox without the CDN, but then media files will not be cached. Unbox will do an `unzip` for every media file request. Only run this way for testing.)

The hash value for a URI is computed by taking the SHA512 hash of the URI, taking the first 48 bits of that, and converting that integer to an alphanumeric string using `toString(36)`. For example: `"games/twine/Absent_Heroes.zip" -> 186486238769662 -> "1u3qlfmqda"`. There is no reason for you to need this information.

## Running Unbox

To run with [Docker][] Compose:

```
docker-compose up --build
```

See the [options.json](./options.json.md) documentation for configuration details.

## Development

You can run Unbox on your local machine. You must first install [Docker][].

[Docker]: https://docs.docker.com/get-docker/

The service uses ports 80 (for the outward-facing nginx server) and 8080 (for the internal ifarchive-unbox server). If you are already running a web service on port 80, you will have to reconfigure Unbox to use a different port. To do this, replace "80" with "8000" in `docker-compose.yml` and `nginx/nginx.sh`.

If you modify the source code, you must bring the service down and back up to see changes:

```
docker-compose down
docker-compose up --build
```
