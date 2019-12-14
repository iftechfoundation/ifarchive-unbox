/*

IF Archive Unboxing server - router
===================================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

import * as frontpage from './frontpage.js'

export async function router(ctx) {
    //const method = ctx.method
    const path = ctx.path
    const query = ctx.query

    // Front page
    if (path === '/') {
        if (!query.url) {
            ctx.body = frontpage.wrapper(frontpage.form())
            return
        }

        // Normalise URLs
        const valid_origins = /^https?:\/\/(mirror\.|www\.)?ifarchive\.org\//
        const request_path = query.url.replace(valid_origins, '')
        console.log(request_path)
    }
}