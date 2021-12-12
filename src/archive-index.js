/*

Process the IF Archive's index
==============================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import fetch from 'node-fetch'
import flow from 'xml-flow'

export default class ArchiveIndex {
    constructor(data_dir, options, cache) {
        this.cache = cache
        this.data_path = path.join(data_dir, 'archive-data.json')
        this.etag = null
        this.etag_path = path.join(data_dir, 'archive-etag.txt')
        this.hash_to_path = null
        this.options = options
        this.path_to_hash = null
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
        // Parse the stored data if we didn't update it just now
        if (!this.hash_to_path) {
            const index_data = JSON.parse(await fs.readFile(this.data_path, {encoding: 'utf8'}))
            await this.update_maps(index_data)
        }

        // Check again later
        setInterval(() => this.check_for_update(), this.options.index.recheck_period)
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
            console.log('ArchiveIndex: Master-Index.xml is unchanged')
            return
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
            const data = []
            const supported_formats = this.options.supported_formats
            const xml = flow(stream)

            xml.on('tag:file', file => {
                if (supported_formats.test(file.path)) {
                    // Trim if-archive/ from the beginning
                    const path = file.path.replace(/^if-archive\//, '')
                    const hash = parseInt(crypto.createHash('sha512').update(path).digest('hex').substring(0, 12), 16)
                    const date = +(new Date(file.date))
                    data.push([hash, path, date])
                }
            })

            xml.on('end', () => resolve(data))
        })
    }

    // Update the maps
    async update_maps(data) {
        const hash_to_date = new Map()
        this.hash_to_path = new Map()
        this.path_to_hash = new Map()
        for (const file of data) {
            const hash = file[0]
            const path = file[1]
            const date = file[2]
            hash_to_date.set(hash, date)
            this.hash_to_path.set(hash, path)
            this.path_to_hash.set(path, hash)
        }
        // Purge the cache of old files
        await this.cache.purge(hash_to_date)
    }
}