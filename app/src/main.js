/*

IF Archive Unboxing server
==========================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

*/

import fs from 'fs/promises'
import {merge} from 'lodash-es'
import path from 'path'

import UnboxApp from './app.js'
import ArchiveIndex from './archive-index.js'
import FileCache from './cache.js'

const default_options = {
    archive_domain: 'ifarchive.org',
    cache: {
        max_buffer: 20000000, // 20 MB
        max_entries: 1000,
        max_size: 1000000000, // 1 GB
    },
    'cache-control-age': 604800, // 1 week
    'cache-control-age-error': 0,
    //domain: 'unbox.ifarchive.org', // App domain
    index: {
        index_url: 'https://ifarchive.org/indexes/Master-Index.xml',
        recheck_period: 5, // Every 5 minutes
    },
    serve_proxy_pac: false, // Whether to serve the proxy.pac file
    subdomains: false, // Whether to use subdomains
}

async function main() {
    // Process ENV
    const data_dir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
    const port = process.env.PORT || 8080

    // Make the data and cache directories
    await fs.mkdir(path.join(data_dir, 'cache'), {recursive: true})

    // Load options
    const options_path = path.join(data_dir, 'options.json')
    let options_json = '{}'
    try {
        options_json = await fs.readFile(options_path, {encoding: 'utf8'})
    }
    catch (_) {}
    const options = merge({}, default_options, JSON.parse(options_json))

    // If no domain option, then disable subdomains
    if (!options.domain) {
        options.subdomains = false
    }

    // Create and initialise the file cache
    const cache = new FileCache(data_dir, options)
    await cache.init()

    // Create and initialise the archive index module
    const index = new ArchiveIndex(data_dir, options, cache)
    cache.index = index
    await index.init()

    // Start the server
    const app = new UnboxApp(options, cache, index)
    app.listen(port)
}

main()