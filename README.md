IF Archive Unboxing Service
===========================

The [Unbox service][Unbox] allows users to view the contents of `zip` and `tar.gz` packages on the [IF Archive][ifarch]. For browser games (such as zipped Twine games), this is all that's needed to make them directly playable.

Unbox also allows web interpreters (such as [iplayif.com][iplayif]) to play `zip`ped-up game files.

[ifarch]: https://ifarchive.org/
[iplayif]: https://iplayif.com/
[Unbox]: https://unbox.ifarchive.org/

## Behavior

The front page ([https://unbox.ifarchive.org/][Unbox]) requests an Archive URL or path. This must be the URL of a `zip` or `tar.gz` on the IF Archive.

For example, you might enter the URL `https://ifarchive.org/if-archive/games/twine/Absent_Heroes.zip`.

This returns a page listing [the package contents][exlist]:

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

For a complete description of Unbox's capabilities, see the [specification document](./doc/spec.md).

## Running Unbox

To run with [Docker][] Compose:

```
docker-compose up --build
```

To adjust configuration options, create a file `data/options.json` containing a JSON map. (The `data` directory will be created the first time you start the service.) See the [options.json](./doc/options.json.md) documentation for configuration details.

## Development

You can run Unbox on your local machine. You must first install [Docker][].

[Docker]: https://docs.docker.com/get-docker/

The service uses ports 80 (for the outward-facing nginx server) and 8080 (for the internal ifarchive-unbox server). If you are already running a web service on port 80, you will have to reconfigure Unbox to use a different port. To do this, replace "80" with "8000" in `docker-compose.yml` and `nginx/nginx.sh`.

If you modify the source code, you must bring the service down and back up to see changes:

```
docker-compose down
docker-compose up --build
```

The server is built on the [Koa][] web framework.

[Koa]: https://koajs.com/
