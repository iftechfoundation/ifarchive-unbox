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
            const request_path = ctx.path
            const query = ctx.query

            // Front page
            if (request_path === '/') {
                if (!query.url) {
                    ctx.body = templates.wrapper(templates.form())
                    return
                }

                // Normalise URLs
                const valid_origins = /^https?:\/\/(mirror\.|www\.)?ifarchive\.org\//
                if (!valid_origins.test(query.url)) {
                    throw new Error(`Sorry, we don't support files from outside the IF Archive`)
                    return
                }

                const file_path = query.url.replace(valid_origins, '').replace(/^if-archive\//, '')
                const hash = this.index.path_to_hash.get(file_path)
                if (!hash) {
                    throw new Error(`Unknown file: ${query.url}`)
                }

                const details = await this.cache.get(hash)

                // Show the list of files
                ctx.body = templates.wrapper(templates.list(path.basename(file_path), hash.toString(36), details.contents))
                return
            }

            // Trying to load a file from a zip
            const path_parts = /^\/([0-9a-zA-Z]+)\/(.+)$/.exec(request_path)
            if (!path_parts) {
                throw new Error('This is not a valid file')
            }
            const hash = parseInt(path_parts[1], 36)
            if (!hash) {
                throw new Error('This is not a valid file')
            }
            if (!this.index.hash_to_path.has(hash)) {
                throw new Error(`Unknown file hash: ${path_parts[1]}`)
            }

            const details = await this.cache.get(hash)
            const file_path = path_parts[2]
            if (details.contents.indexOf(file_path) < 0) {
                throw new Error(`${this.index.hash_to_path.get(hash)} does not contain file ${file_path}`)
            }

            // Pipe the unzipped file to body
            ctx.type = path.extname(file_path)
            ctx.body = this.cache.get_file(hash, file_path, details.type)
        }
        catch (err) {
            this.error(ctx, err)
        }
    }
}