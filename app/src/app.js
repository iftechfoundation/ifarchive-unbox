/*

IF Archive Unboxing server
==========================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

*/

import child_process from 'child_process'
import path from 'path'
import Koa from 'koa'

import {COMMON_FILE_TYPES, TYPES_TO_DETECT_BETTER, UNSAFE_FILES} from './defines.js'
import * as templates from './templates.js'

const PATH_PARTS = /^\/([0-9a-zA-Z]+)\/?(.*)$/
const VALID_ORIGINS = /^https?:\/\/(mirror\.|www\.)?ifarchive\.org\//

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}


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
                ctx.body = templates.wrapper({
                    content: templates.error(err),
                })
                if (ctx.status !== 400) {
                    ctx.app.emit('error', err, ctx)
                }
            }
        })

        // Redirect to subdomains
        if (options.subdomains) {
            this.app.subdomainOffset = domain.split('.').length
            this.app.use(async (ctx, next) => {
                const path = ctx.path
                const subdomain_count = ctx.subdomains.length

                // Too many subdomains
                if (subdomain_count > 1) {
                    ctx.throw(400, 'Too many subdomains')
                }

                // Safe file on non-subdomain
                if (subdomain_count === 1 && !UNSAFE_FILES.test(path)) {
                    ctx.status = 301
                    ctx.redirect(`//${domain}${path}`)
                    return
                }

                // Unsafe file on main domain
                if (subdomain_count === 0 && UNSAFE_FILES.test(path)) {
                    const path_parts = PATH_PARTS.exec(path)
                    if (path_parts) {
                        ctx.status = 301
                        ctx.redirect(`//${path_parts[1]}.${domain}${path}`)
                        return
                    }
                }

                await next()
            })
        }

        // Serve a proxy.pac file
        if (domain && options.serve_proxy_pac) {
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

        // Cache this please
        ctx.set('Cache-Control', `max-age=${this.options['cache-control-age']}`)

        // Front page
        if (request_path === '/') {
            if (!query.url) {
                ctx.body = templates.wrapper({
                    content: templates.form(),
                })
                return
            }

            // Normalise URLs
            if (!VALID_ORIGINS.test(query.url)) {
                ctx.throw(400, `Sorry, we don't support files from outside the IF Archive`)
            }

            let file_path = query.url.replace(VALID_ORIGINS, '').replace(/^if-archive\//, '')

            // Handle symlinks
            if (this.index.symlinked_files.has(file_path)) {
                file_path = this.index.symlinked_files.get(file_path)
            }
            else {
                for (const [path, target] of this.index.symlinked_dirs) {
                    if (file_path.startsWith(path)) {
                        file_path = file_path.replace(path, target)
                        break
                    }
                }
            }

            const hash = this.index.path_to_hash.get(file_path)
            if (!hash) {
                ctx.throw(400, `Unknown file: ${query.url}`)
            }

            const details = await this.cache.get(hash)

            // Search for a file
            if (query.find) {
                const candidates = details.contents.filter(file => new RegExp("(^|/)" + escapeRegExp(query.find) + "$", 'i').test(file))
                if (candidates.length > 1) {
                    ctx.body = templates.wrapper({
                        canonical: `//${this.options.domain}/?url=https://if-archive.org/if-archive/${file_path}&find=${query.find}`,
                        content: templates.list(`Files matching ${query.find} in`, file_path, hash.toString(36), candidates, this.options.domain, this.options.subdomains),
                        title: path.basename(file_path),
                    })
                    return
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

            // JSON
            if ('json' in query) {
                ctx.body = {
                    files: details.contents
                }
                return
            }

            // Show the list of files
            ctx.body = templates.wrapper({
                canonical: `//${this.options.domain}/?url=https://if-archive.org/if-archive/${file_path}`,
                content: templates.list('Contents of', file_path, hash.toString(36), details.contents, this.options.domain, this.options.subdomains),
                title: path.basename(file_path),
            })
            return
        }

        // Trying to load a file from a zip
        const path_parts = PATH_PARTS.exec(request_path)
        if (!path_parts) {
            ctx.throw(400, 'This is not a valid file')
        }
        const hash_string = path_parts[1]
        const hash = parseInt(hash_string, 36)
        const zip_path = this.index.hash_to_path.get(hash)
        if (!zip_path) {
            ctx.throw(400, `Unknown file hash: ${hash_string}`)
        }

        // Redirect folder views back to the index
        const file_path = decodeURIComponent(path_parts[2])
        if (file_path === '' || file_path.endsWith('/')) {
            ctx.status = 301
            ctx.redirect(`/?url=https://ifarchive.org/if-archive/${zip_path}`)
            return
        }

        const details = await this.cache.get(hash)
        if (details.contents.indexOf(file_path) < 0) {
            ctx.throw(400, `${zip_path} does not contain file ${file_path}`)
        }

        // Check for non-matching subdomain
        if (this.options.subdomains && UNSAFE_FILES.test(file_path) && !ctx.hostname.startsWith(hash_string)) {
            ctx.throw(400, `Incorrect subdomain`)
        }

        // Send and check the Last-Modified/If-Modified-Since headers
        ctx.status = 200
        ctx.lastModified = new Date(details.date)
        if (ctx.fresh) {
            ctx.status = 304
            return
        }

        // Type detection
        // We define some file types for common extensions
        const ext = path.extname(file_path).substring(1)
        if (COMMON_FILE_TYPES[ext]) {
            ctx.set('Content-Type', COMMON_FILE_TYPES[ext])
        }
        // Or else use Koa's type detection
        else {
            ctx.type = ext
        }

        // For certain types, try to get a more accurate file type and encoding
        const mime_type = ctx.type
        if (!mime_type || TYPES_TO_DETECT_BETTER.includes(mime_type)) {
            const new_type = await this.cache.get_file_type(hash, file_path, details.type)
            console.log(new_type)
            ctx.type = new_type
        }

        // Pipe the unzipped file to body
        ctx.body = this.cache.get_file_stream(hash, file_path, details.type)
    }
}