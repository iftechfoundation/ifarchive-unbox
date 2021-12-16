/*

IF Archive Unboxing server
==========================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

*/

import path from 'path'
import Koa from 'koa'

import * as templates from './templates.js'

export default class UnboxApp {
    constructor(options, cache, index) {
        this.cache = cache
        this.index = index
        this.options = options

        const domain = options.domain

        this.app = new Koa()

        // Add the layers

        // Catch errors
        this.app.use(async (ctx, next) => {
            try {
                await next()
            }
            catch (err) {
                ctx.status = err.statusCode || err.status || 500
                ctx.body = templates.wrapper(templates.error(err), '')
                if (ctx.status !== 400) {
                    ctx.app.emit('error', err, ctx)
                }
            }
        })

        // Serve a proxy.pac file
        if (domain || options.serve_proxy_pac) {
            this.app.use(async (ctx, next) => {
                if (ctx.path === '/proxy.pac') {
                    // serve a proxy.pac file for testing *.localhost wildcard domains
                    ctx.status = 200
                    ctx.type = 'application/x-ns-proxy-autoconfig'
                    ctx.body = `function FindProxyForURL(url, host) { if (shExpMatch(host, "*${domain}")) { return "PROXY ${domain}:80" } return "DIRECT" }`
                    return
                }
                await next()
            })
        }

        // And the main handler
        this.app.use(this.handler.bind(this))
    }

    listen(port) {
        console.log(`Starting IF Archive Unboxing server on port ${port}`)
        this.app.listen(port)
    }

    async handler(ctx) {
        const request_path = ctx.path
        const query = ctx.query

        // Solve CORS issues
        ctx.set('Access-Control-Allow-Origin', '*')

        // Front page
        if (request_path === '/') {
            if (!query.url) {
                ctx.body = templates.wrapper(templates.form(), '')
                return
            }

            // Normalise URLs
            const valid_origins = /^https?:\/\/(mirror\.|www\.)?ifarchive\.org\//
            if (!valid_origins.test(query.url)) {
                ctx.throw(400, `Sorry, we don't support files from outside the IF Archive`)
            }

            const file_path = query.url.replace(valid_origins, '').replace(/^if-archive\//, '')
            const hash = this.index.path_to_hash.get(file_path)
            if (!hash) {
                ctx.throw(400, `Unknown file: ${query.url}`)
            }

            const details = await this.cache.get(hash)

            // Search for a file
            if (query.find) {
                const candidates = details.contents.filter(file => file.endsWith(query.find))
                if (candidates.length > 1) {
                    ctx.throw(400, 'Multiple matching files')
                }
                if (candidates.length === 0) {
                    ctx.throw(400, 'No matching file')
                }
                ctx.status = 301
                ctx.redirect(`/${hash.toString(36)}/${candidates[0]}`)
                return
            }

            // Send and check the Last-Modified/If-Modified-Since headers
            ctx.status = 200
            ctx.lastModified = new Date(details.date)
            if (ctx.fresh) {
                ctx.status = 304
                return
            }

            // Show the list of files
            ctx.body = templates.wrapper(templates.list(file_path, hash.toString(36), details.contents), `${path.basename(file_path)} - `)
            return
        }

        // Trying to load a file from a zip
        const path_parts = /^\/([0-9a-zA-Z]+)\/?(.*)$/.exec(request_path)
        if (!path_parts) {
            ctx.throw(400, 'This is not a valid file')
        }
        const hash = parseInt(path_parts[1], 36)
        if (!hash) {
            ctx.throw(400, 'This is not a valid file')
        }
        const zip_path = this.index.hash_to_path.get(hash)
        if (!zip_path) {
            ctx.throw(400, `Unknown file hash: ${path_parts[1]}`)
        }

        // Redirect folder views back to the index
        if (path_parts[2] === '' || path_parts[2].endsWith('/')) {
            ctx.status = 301
            ctx.redirect(`/?url=https://ifarchive.org/if-archive/${zip_path}`)
            return
        }

        const details = await this.cache.get(hash)
        const file_path = decodeURIComponent(path_parts[2])
        if (details.contents.indexOf(file_path) < 0) {
            ctx.throw(400, `${zip_path} does not contain file ${file_path}`)
        }

        // Send and check the Last-Modified/If-Modified-Since headers
        ctx.status = 200
        ctx.lastModified = new Date(details.date)
        if (ctx.fresh) {
            ctx.status = 304
            return
        }

        // Pipe the unzipped file to body
        ctx.type = path.extname(file_path)
        ctx.body = this.cache.get_file(hash, file_path, details.type)
    }
}