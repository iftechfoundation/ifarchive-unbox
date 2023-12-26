/*

Process the IF Archive's index
==============================

Copyright (c) 2023 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

This periodically checks the Master-Index.xml file on the main Archive
server. If the file has changed (as indicated by its ETag header) it
downloads it and parses it.

*/

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import {SUPPORTED_FORMATS} from './common.js'

import fetch from 'node-fetch'
import flow from 'xml-flow'

const JSON_VERSION = 7

export default class ArchiveIndex {
    constructor(data_dir, options, cache) {
        this.cache = cache
        this.data_path = path.join(data_dir, 'archive-data.json')
        this.etag = null
        this.etag_path = path.join(data_dir, 'archive-etag.txt')
        this.hash_to_path = null
        this.options = options
        this.path_to_hash = null
        this.symlinked_dirs = null
        this.symlinked_files = null
        this.blocked_files = null
    }

    async init() {
        // Try to load an old etag
        try {
            this.etag = await fs.readFile(this.etag_path, {encoding: 'utf8'})
        }
        catch (_) {
            this.etag = null
        }

        await this.check_for_update()

        // Check again later
        setInterval(() => this.check_for_update(), this.options.index.recheck_period * 60 * 1000)
    }

    async check_for_update() {
        // Get the current Master-Index.xml
        const head_response = await fetch(this.options.index.index_url, {method: 'HEAD'})
        if (!head_response.ok) {
            throw new Error(`Error accessing Master-Index.xml: ${head_response.status}, ${head_response.statusText}`)
        }
        const new_etag = head_response.headers.get('etag')
        if (!new_etag) {
            throw new Error('Master-Index.xml has no etag header')
        }
        if (this.etag === new_etag) {
            if (this.hash_to_path) {
                return
            }
            // Parse the stored data if we didn't update it just now
            const index_data = JSON.parse(await fs.readFile(this.data_path, {encoding: 'utf8'}))
            if (index_data.version === JSON_VERSION) {
                console.log('ArchiveIndex: Loading stored data')
                await this.update_maps(index_data)
                return
            }
            console.log('ArchiveIndex: Stored data is in old format')
        }

        // A new etag!
        console.log('ArchiveIndex: Master-Index.xml is changed! Updating the index')
        this.etag = new_etag

        // Stream the index to the parser
        const response = await fetch(this.options.index.index_url)
        if (!response.ok) {
            throw new Error(`Error accessing Master-Index.xml: ${response.status}, ${response.statusText}`)
        }
        const index_data = await this.parse_xml(response.body)

        // Update our maps
        await this.update_maps(index_data)

        // Write the new files
        fs.writeFile(this.data_path, JSON.stringify(index_data))
        await fs.writeFile(this.etag_path, new_etag)
    }

    // Parse the Master-Index.xml stream
    parse_xml(stream) {
        return new Promise((resolve) => {
            const files = []
            const symlinks = []
            const meta_blocks = []
            const xml = flow(stream)

            xml.on('tag:file', file => {
                // Trim if-archive/ from the beginning
                const path = file.path.substring(11)
                // Handle symlinks
                if (file.symlink) {
                    // Only add zip file symlinks to the index
                    if (file.symlink.$attrs.type === 'file') {
                        if (!SUPPORTED_FORMATS.test(path)) {
                            return
                        }
                        // Resolve the relative path
                        symlinks.push([path, (new URL(file.symlink.path, 'https://ifarchive.org/if-archive/' + path)).toString().substring(33)])
                    }
                    else {
                        // Trim if-archive/
                        symlinks.push([path, file.symlink.name.substring(11)])
                    }
                }
                // Regular files
                else if (SUPPORTED_FORMATS.test(path)) {
                    // 48 bits of the sha512 hash of the path
                    let hash = parseInt(crypto.createHash('sha512').update(path).digest('hex').substring(0, 12), 16)
                    hash = hash.toString(36).padStart(10, '0')
                    const date = parseInt(file.rawdate, 10) * 1000
                    files.push([hash, path, date])

                    if (file.metadata) {
                        let items = file.metadata
                        if (!Array.isArray(items)) {
                            items = [ items ]
                        }
                        for (const item of items) {
                            if (item.key === 'unbox-block' && item.value === 'true') {
                                meta_blocks.push(hash)
                            }
                        }
                    }
                }
            })

            xml.on('end', () => resolve({
                files,
                meta_blocks,
                symlinks,
                version: JSON_VERSION,
            }))
        })
    }

    // Update the maps
    async update_maps(data) {
        // Files
        const hash_to_date = new Map()
        this.hash_to_path = new Map()
        this.path_to_hash = new Map()
        for (const file of data.files) {
            const hash = file[0]
            const path = file[1]
            const date = file[2]
            hash_to_date.set(hash, date)
            this.hash_to_path.set(hash, path)
            this.path_to_hash.set(path, hash)
        }

        // Symlinks
        this.symlinked_dirs = new Map()
        this.symlinked_files = new Map()
        for (const symlink of data.symlinks) {
            if (SUPPORTED_FORMATS.test(symlink[0])) {
                this.symlinked_files.set(symlink[0], symlink[1])
            }
            else {
                this.symlinked_dirs.set(symlink[0], symlink[1])
            }
        }

        // Metadata
        this.blocked_files = new Set()
        for (const hash of data.meta_blocks) {
            this.blocked_files.add(hash)
        }

        console.log(`ArchiveIndex: found ${this.hash_to_path.size} hash entries, ${this.symlinked_dirs.size} symlinked dirs, ${this.symlinked_files.size} symlinked files, ${this.blocked_files.size} blocked files`)

        // Purge the cache of old files
        await this.cache.purge(hash_to_date)
    }
}
