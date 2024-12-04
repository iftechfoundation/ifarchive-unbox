/*

IF Archive Unboxing server
==========================

Copyright (c) 2024 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

*/

import path from 'path'
import Koa from 'koa'
import {koaBody} from 'koa-body'

import {
    COMMON_FILE_TYPES,
    TYPES_THAT_ARENT_NO_TRANSFORM,
    TYPES_TO_DETECT_BETTER,
    UNSAFE_FILES,
    escape_regexp,
} from './common.js'
import * as templates from './templates.js'

const PATH_PARTS = /^\/([0-9a-zA-Z]+)\/?(.*)$/
const VALID_ORIGINS = /^(https?:\/\/(mirror\.|www\.)?ifarchive\.org)?\//

// https://github.com/iftechfoundation/ifarchive-unbox/issues/61
// When adding subdomains to this list, we need to manually add them in the Cloudflare admin tool
const ALLOWED_SUBDOMAINS = new Set([
    // /if-archive/games/competition2024/Games/Quest_for_the_Teacup_of_Minor_Sentimental_Value.zip
    '2k788xeots',
])

export default class UnboxApp {
    constructor(options, cache, index) {
        this.cache = cache
        this.index = index
        this.options = options

        const domain = options.domain
        this.subdomains_count = this.options.domain.split('.').length

        this.app = new Koa()

        // Add the layers

        // Catch errors
        this.app.use(async (ctx, next) => {
            try {
                await next()
            }
            catch (err) {
                // Only cache errors for a day (by default)
                ctx.set('Cache-Control', `max-age=${this.options['cache-control-age-error']}`)

                ctx.status = err.statusCode || err.status || 500
                if ('json' in ctx.query) {
                    ctx.body = {
                        error: err,
                    }
                }
                else {
                    ctx.body = templates.wrapper({
                        content: templates.error(err),
                    })
                }
                if (ctx.status < 400 || ctx.status > 404) {
                    const errdate = new Date()
                    console.log(`Internal error: (${errdate.toISOString()}): ${ctx.url}`)
                    ctx.app.emit('error', err, ctx)
                }
            }
        })

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

        this.app.use(koaBody())

        this.app.use(async (ctx, next) => {
            try {
                await next()
            } finally {
                console.log(`${ctx.method} ${ctx.url} ${ctx.status} "${ctx.headers['if-modified-since']}" "${ctx.headers['cache-control']}"`)
            }
        })

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

        ctx.set('Cache-Control', `max-age=1`)

        const ctxFresh = () => {
            if (this.options.nginx?.cache?.support_bypass) {
                // ctx fresh uses https://github.com/jshttp/fresh/blob/v0.5.2/index.js#L43-L49
                // which always honors `Cache-Control: no-cache` in the request header
                return ctx.fresh
            } else {
                const modifiedSince = ctx.request.headers['if-modified-since']
                return !!modifiedSince && modifiedSince === ctx.response.headers['last-modified']
            }
        }

        // Front page
        if (request_path === '/') {
            // Allow the IF Archive admins to direct us to update the index as soon as it changes
            if ('recheck_index' in query) {
                if (ctx.request.method !== 'POST') {
                    ctx.throw(405, 'Rechecking the index must use POST')
                }

                const recheck_key = ctx.request.body.key
                if (recheck_key !== this.options.index.recheck_key) {
                    ctx.throw(401, 'Secret key does not match')
                }

                this.index.check_for_update()
                ctx.body = 'Rechecking the IF Archive index...'
                return
            }

            if (!query.url) {
                ctx.body = templates.wrapper({
                    content: templates.form(),
                })
                return
            }

            // Normalise URLs
            const url = decodeURI(query.url)
            if (!VALID_ORIGINS.test(url)) {
                ctx.throw(400, `Sorry, we don't support files from outside the IF Archive`)
            }

            // Remove the "http://domain/" part
            let file_path = url.replace(VALID_ORIGINS, '')

            if (!file_path.startsWith('if-archive/')) {
                ctx.throw(403, `Sorry, we don't support files outside the if-archive tree`)
            }

            // Remove "if-archive/" part
            file_path = file_path.substring(11)

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
                ctx.throw(404, `Unknown file: ${query.url}`)
            }

            if (this.index.blocked_files.has(hash)) {
                ctx.throw(403, `Cannot handle file: ${query.url}`)
            }

            const details = await this.cache.get(hash)

            // Open (redirect) to a specific file
            const filename = query.open
            if (filename) {
                if (details.contents.includes(filename)) {
                    ctx.status = 301
                    ctx.redirect(`/${hash}/${filename}`)
                    return
                }
                const open_regexp = new RegExp(`(^|/)${escape_regexp(filename)}$`, 'i')
                const results = details.contents.filter(file => open_regexp.test(file))
                if (results.length > 1) {
                    ctx.throw(400, 'Filename is not unique')
                }
                if (results.length === 1) {
                    ctx.status = 301
                    ctx.redirect(`/${hash}/${results[0]}`)
                    return
                }
                // No matching file, but if enabled we can look for another file of the same type
                if (this.options.open_file_of_same_type) {
                    const same_type_regexp = new RegExp(`\\.${path.extname(filename).substring(1)}$`, 'i')
                    const results = details.contents.filter(file => same_type_regexp.test(file))
                    if (results.length === 1) {
                        ctx.status = 301
                        ctx.redirect(`/${hash}/${results[0]}`)
                        return
                    }
                }
                ctx.throw(404, 'No matching file')
            }

            // Send and check the Last-Modified/If-Modified-Since headers
            ctx.status = 200
            ctx.lastModified = new Date(details.date)
            if (ctxFresh()) {
                ctx.status = 304
                return
            }

            // Search for files
            const search = query.search
            if (search) {
                const search_regexp = new RegExp(escape_regexp(search), 'i')
                const results = details.contents.filter(file => search_regexp.test(file))
                if ('json' in query) {
                    ctx.body = {
                        files: results,
                        hash: hash,
                    }
                }
                else {
                    ctx.body = templates.wrapper({
                        canonical: `//${this.options.domain}/?url=https://if-archive.org/if-archive/${file_path}&find=${search}`,
                        content: templates.list({
                            alllink: true,
                            domain: this.options.domain,
                            files: results,
                            hash: hash,
                            label: `Files matching ${search} in`,
                            path: file_path,
                            subdomains: this.options.subdomains,
                        }),
                        title: path.basename(file_path),
                    })
                }
                return
            }

            // JSON
            if ('json' in query) {
                ctx.body = {
                    files: details.contents,
                    hash: hash,
                }
                return
            }

            // Look for one index.html file (or one .html file in general) to show with a Start button
            const htmlfiles = details.contents.filter(file => /\.html?$/i.test(file))
            let starthtml
            if (htmlfiles.length) {
                // Only one HTML file
                if (htmlfiles.length === 1) {
                    starthtml = htmlfiles[0]
                }
                else {
                    // Look for index.html in root position
                    if (htmlfiles.includes('index.html')) {
                        starthtml = 'index.html'
                    }
                    else if (htmlfiles.includes('index.htm')) {
                        starthtml = 'index.htm'
                    }
                    else {
                        // Or else an index.html file in any subfolder
                        const indexfiles = htmlfiles.filter(file => /index\.html?$/i.test(file))
                        if (indexfiles.length === 1) {
                            starthtml = indexfiles[0]
                        }
                    }
                }
            }

            // Show the list of files
            ctx.body = templates.wrapper({
                canonical: `//${this.options.domain}/?url=https://if-archive.org/if-archive/${file_path}`,
                content: templates.list({
                    domain: this.options.domain,
                    files: details.contents,
                    hash: hash,
                    label: 'Contents of',
                    path: file_path,
                    starthtml,
                    subdomains: this.options.subdomains,
                }),
                title: path.basename(file_path),
            })
            return
        }

        // Trying to load a file from a zip
        const path_parts = PATH_PARTS.exec(request_path)
        if (!path_parts) {
            ctx.throw(400, 'This is not a valid file')
        }
        const hash = path_parts[1]
        // We could validate the hash format here, but only valid hashes are in index.hash_to_path.
        const zip_path = this.index.hash_to_path.get(hash)
        if (!zip_path) {
            ctx.throw(404, `Unknown file hash: ${hash}`)
        }

        // Redirect folder views back to the index
        let file_path = decodeURIComponent(path_parts[2])
        if (file_path === '' || file_path.endsWith('/')) {
            ctx.status = 301
            ctx.redirect(`/?url=https://ifarchive.org/if-archive/${zip_path}`)
            return
        }

        // Check the requested file is in the zip
        const details = await this.cache.get(hash)
        if (details.contents.indexOf(file_path) < 0) {
            // Support HTML files designed on case-insensitive file systems by looking for files with the same name ignoring case
            const case_insensitive_matches = details.contents.filter(file => file_path.localeCompare(file, undefined, {sensitivity: 'accent'}) === 0)
            if (case_insensitive_matches.length === 1) {
                ctx.status = 301
                ctx.redirect(`/${hash}/${case_insensitive_matches[0]}`)
                return
            }
            ctx.throw(404, `${zip_path} does not contain file ${file_path}`)
        }

        // If we have normalised file paths, restore the original path
        if (details.normalised_paths) {
            file_path = details.normalised_paths[file_path]
        }

        // Redirect to subdomains
        if (this.options.subdomains) {
            const path = ctx.path
            const subdomains = ctx.host.split('.')
            const subdomain_count = subdomains.length - this.subdomains_count

            // Too many subdomains
            if (subdomain_count > 1) {
                ctx.throw(400, 'Too many subdomains')
            }

            // Safe file on non-subdomain
            if (subdomain_count === 1 && !UNSAFE_FILES.test(path) && !ALLOWED_SUBDOMAINS.has(subdomains[0])) {
                ctx.status = 302
                ctx.redirect(`//${this.options.domain}${path}?lastmod=${details.date}`)
                return
            }

            // Unsafe file on main domain
            if (subdomain_count === 0 && UNSAFE_FILES.test(path)) {
                const path_parts = PATH_PARTS.exec(path)
                if (path_parts) {
                    ctx.status = 301
                    ctx.redirect(`//${path_parts[1]}.${this.options.domain}${path}`)
                    return
                }
            }
        }

        if ('lastmod' in query) {
            // Cache this please
            ctx.set('Cache-Control', `max-age=${this.options['cache-control-age']}`)
        }

        // Send and check the Last-Modified/If-Modified-Since headers
        ctx.status = 200
        ctx.lastModified = new Date(details.date)
        if (ctxFresh()) {
            ctx.status = 304
            return
        }

        await this.set_type(ctx, file_path, hash, details.type)

        // Cloudflare compresses only a small list of MIME types, and they don't include any of our storyfile formats
        // Consult the list to see if we need to set a Cache-control: no-transform header
        if (!TYPES_THAT_ARENT_NO_TRANSFORM.includes(ctx.type)) {
            ctx.set('Cache-Control', `max-age=${this.options['cache-control-age']}, no-transform`)
        }

        // Pipe the unzipped file to body
        ctx.body = this.cache.get_file_stream(hash, file_path, details.type)
    }

    // Type detection
    async set_type(ctx, file_path, hash, type) {
        // We define some file types for common extensions
        const ext = path.extname(file_path).substring(1).toLowerCase()
        if (COMMON_FILE_TYPES[ext]) {
            ctx.set('Content-Type', COMMON_FILE_TYPES[ext])
        }
        // Or else use Koa's type detection
        else {
            ctx.type = ext
        }

        // For certain types, try to get a more accurate file type and encoding
        const mime_type = ctx.type
        if (mime_type && !TYPES_TO_DETECT_BETTER.includes(mime_type)) {
            return
        }

        // For HTML, check for a <meta charset>
        if (mime_type === 'text/html') {
            const header = (await this.cache.get_file_buffer(hash, file_path, type, 1024)).toString('latin1')
            const charset = /<meta\s+charset=['"]?([\w-]+)['"]?\s*\/?>/i.exec(header)
            if (charset) {
                ctx.type = `text/html; charset=${charset[1]}`
                return
            }
        }

        // Or try calling the file command
        ctx.type = await this.cache.get_file_type(hash, file_path, type)

        // The file command may decide HTML fragments aren't HTML, so force them back to being HTML
        if (mime_type === 'text/html') {
            ctx.set('Content-Type', `text/html;${ctx.response.get('Content-Type').split(';')[1]}`)
        }
    }
}
