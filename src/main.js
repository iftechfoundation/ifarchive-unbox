/*

IF Archive Unboxing server
==========================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

import fs from 'fs/promises'
import path from 'path'

import UnboxApp from './app.js'
import ArchiveIndex from './archive-index.js'
import FileCache from './cache.js'

const default_options = {
    archive_domain: 'ifarchive.org',
    cache: {
        max_entries: 1000,
        max_size: 1000000000, // 1 GB
    },
    index: {
        recheck_period: 21600000, // Every 6 hours
        index_url: 'https://ifarchive.org/indexes/Master-Index.xml',
    },
    supported_formats: /\.(tar\.gz|zip)$/i,
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
    const options = Object.assign({}, default_options, JSON.parse(options_json))

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