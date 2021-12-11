/*

File cache
==========

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

/*
This cache will keep track of both the number of entries, and the total download size, evicting the least recently used when either goes over the limit
When the ArchiveIndex sees an update, it will purge any outdated entries
*/

import child_process from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import util from 'util'

const execFile = util.promisify(child_process.execFile)

class CacheEntry {
    constructor (contents, date, size, type) {
        this.contents = contents
        this.date = date
        this.size = size
        this.type = type
    }
}

export default class FileCache {
    constructor(data_dir, options) {
        this.cache = new Map()
        this.cache_dir = path.join(data_dir, 'cache')
        this.index = null
        this.lru = []
        this.max_entries = options.cache.max_entries
        this.max_size = options.cache.max_size
        this.options = options
        this.size = 0
    }

    async init() {
        // TODO reload the cache from disk
    }

    // Download and set up a cache entry
    async download(hash) {
        // Download the file with curl
        const url = `https://${this.options.archive_domain}/if-archive/${this.index.hash_to_path.get(hash)}`
        const cache_path = path.join(this.cache_dir, hash.toString(36))
        const details = await execFile('curl', [url, '-o', cache_path, '-s', '-S', '-D', '-'])
        if (details.stderr) {
            throw new Error(`curl error: ${details.stderr}`)
        }

        // Parse the date
        const date_header = /last-modified:\s+\w+,\s+(\d+\s+\w+\s+\d+)/.exec(details.stdout)
        if (!date_header) {
            throw new Error('Could not parse last-modified header')
        }
        const date = new Date(date_header[1])

        // Reset the file's date
        const pad = num => num.toString().padStart(2, '0')
        const touch = await execFile('touch', ['-t', `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}0000`, cache_path])
        if (touch.stderr) {
            throw new Error(`touch error: ${touch.stderr}`)
        }

        // Get the file size
        const size = (await fs.stat(cache_path)).size
        this.size += size

        // Get the files inside
        let type = null
        if (/\.zip/i.test(url)) {
            type = 'zip'
        }
        const contents = await this.list_contents(cache_path, type)

        // Update the cache
        const entry = new CacheEntry(contents, +date, size, type)
        this.cache.set(hash, entry)
        return entry
    }

    // Get a file out of the cache, or download it
    async get(hash) {
        if (this.cache.has(hash)) {
            this.hit(hash)
            return this.cache.get(hash)
        }

        this.lru.unshift(hash)
        const entry_promise = this.download(hash)
        this.cache.set(hash, entry_promise)
        return entry_promise
    }

    // Get a file from a zip, returning a stream
    get_file(hash, file_path, type) {
        if (type === 'zip') {
            const child = child_process.spawn('unzip', ['-p', path.join(this.cache_dir, hash.toString(36)), file_path])
            return child.stdout
        }
        else {
            throw new Error('Other archive format not yet supported')
        }
    }

    // Update the LRU list
    hit(hash) {
        const oldpos = this.lru.indexOf(hash)
        this.lru.splice(oldpos, 1)
        this.lru.unshift(hash)
    }

    // List the contents of a zip
    async list_contents(path, type) {
        const contents = []
        if (type === 'zip') {
            const zip_contents = await execFile('unzip', ['-l', path])
            if (zip_contents.stderr) {
                throw new Error(`unzip error: ${zip_contents.stderr}`)
            }
            const lines = zip_contents.stdout.trim().split('\n').slice(3, -2)
            for (const line of lines) {
                const matched = /^\s+(\d+)\s+[0-9-]+\s+[0-9:]+\s+(\w.+)$/.exec(line)
                const size = parseInt(matched[1], 10)
                const file_path = matched[2]
                if (size) {
                    contents.push(file_path)
                }
            }
        }
        else {
            throw new Error('Other archive format not yet supported')
        }
        contents.sort()
        return contents
    }

    // Purge out of date files
    async purge(data) {
        for (const [hash, entry] of this.cache) {
            if (entry instanceof CacheEntry && entry.date !== data.get(hash))
            {
                this.cache.delete(hash)
                const oldpos = this.lru.indexOf(hash)
                this.lru.splice(oldpos, 1)
                await fs.rm(path.join(this.cache_dir, hash.toString(36)))
            }
        }
    }
}