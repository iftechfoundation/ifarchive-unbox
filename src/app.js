/*

IF Archive Unboxing server
==========================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

import path from 'path'
import Koa from 'koa'

import * as templates from './templates.js'

export default class UnboxApp {
    constructor(options, cache, index) {
        this.cache = cache
        this.index = index
        this.options = options

        this.app = new Koa()
        this.app.use(this.router.bind(this))
    }

    error(ctx, msg) {
        ctx.body = templates.wrapper(templates.error(msg))
        ctx.status = 400
    }

    listen(port) {
        this.app.listen(port)
    }

    async router(ctx) {
        try {
            //const method = ctx.method
            const url_path = ctx.path
            const query = ctx.query

            // Front page
            if (url_path === '/') {
                if (!query.url) {
                    ctx.body = templates.wrapper(templates.form())
                    return
                }

                // Normalise URLs
                const valid_origins = /^https?:\/\/(mirror\.|www\.)?ifarchive\.org\//
                if (!valid_origins.test(query.url)) {
                    this.error(ctx, `Sorry, we don't support files from outside the IF Archive`)
                    return
                }

                const file_path = query.url.replace(valid_origins, '').replace(/^if-archive\//, '')
                const hash = this.index.path_to_hash.get(file_path)
                if (!hash) {
                    this.error(ctx, `Unknown file: ${query.url}`)
                    return
                }

                let details = await this.cache.get(hash)

                // Show the list of files
                ctx.body = templates.wrapper(templates.list(path.basename(file_path), hash.toString(36), details.contents))
            }
        }
        catch (err) {
            this.error(ctx, err)
        }
    }
}