/*

File cache
==========

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

*/

/*
This cache will keep track of both the number of entries, and the total download size, evicting the least recently used when either goes over the limit
When the ArchiveIndex sees an update, it will purge any outdated entries
*/

import child_process from 'child_process'
import fetch from 'node-fetch'
import fs from 'fs/promises'
import fs_sync from 'fs'
import {chunk} from 'lodash-es'
import path from 'path'
import { pipeline } from 'stream/promises'
import util from 'util'

import {SUPPORTED_FORMATS} from './common.js'

const execFile = util.promisify(child_process.execFile)

/* Promise-rejection handlers for untar/unzip. These return objects of the
   form { stdout, stderr } or { failed, stdout, stderr }.

   The caller should log stderr if it exists, but consider the call to
   have succeeded unless failed is true.
*/

function untar_error(err) {
    if (err.signal) {
        return { failed:true, stdout:err.stdout, stderr:`SIGNAL ${err.signal}\n${err.stderr}` }
    }
    if (err.code !== 0) {
        return { failed:true, stdout:err.stdout, stderr:err.stderr }
    }
    // For certain old tar files, stderr contains an error like "A lone zero block at..." But err.code is zero so we consider it success.
    return { stdout:err.stdout, stderr:err.stderr }
}

function unzip_error(err) {
    if (err.signal) {
        return { failed:true, stdout:err.stdout, stderr:`SIGNAL ${err.signal}\n${err.stderr}` }
    }
    // Special case: unzip returns status 1 for "unzip succeeded with warnings". (See man page.) We consider this to be a success.
    // We see this with certain zip files and warnings like "128 extra bytes at beginning or within zipfile".
    if (err.code !== 0 && err.code !== 1) {
        return { failed:true, stdout:err.stdout, stderr:err.stderr }
    }
    return { stdout:err.stdout, stderr:err.stderr }
}

/* Callback-based function to spawn a process and pipe its output into
   /usr/bin/file.

   The callback is of the form callback(err, value). On success,
   value will be { stdout, stderr }. If something went wrong, the
   return object will be the first argument, and will look like
   { failed:true, stdout, stderr }.

   (This is slightly awkward, sorry. It's meant to be used with
   util.promisify(); see below.)
*/
function spawn_pipe_file_cb(command, args, callback) {
    const unproc = child_process.spawn(command, args)
    const fileproc = child_process.spawn('file', ['-i', '-'])

    // Accumulated output of the file command
    let stdout = ''

    // Accumulated error output
    // (Both unzip and file send their stderr here, which means they could interleave weirdly, but in practice it will be one or the other.)
    let stderr = ''

    // status code of the unzip/untar process
    let uncode = null

    // Send unzip stdout to file stdin
    unproc.stdout.on('data', data => { fileproc.stdin.write(data) })
    // Add stderr to our accumulator.
    unproc.stderr.on('data', data => { stderr += data })
    unproc.on('close', code => {
        // Record the status code of the unzip process
        uncode = code
        // Again, unzip code 1 is okay
        if (command === 'unzip' && code === 1)
            uncode = 0
        fileproc.stdin.end()
    })

    // Ignore errors sending data to file stdin. (It likes to close its input, which results in an EPIPE error.)
    fileproc.stdin.on('error', () => {})
    // Add stdout and stderr to our accumulators.
    fileproc.stdout.on('data', data => { stdout += data })
    fileproc.stderr.on('data', data => { stderr += data })

    fileproc.on('close', code => {
        // All done; call the callback. Fill in the first argument for failure, second arguent for success.
        if (uncode)
            callback({ failed:true, stdout:stdout, stderr:stderr }, undefined)
        else if (code)
            callback({ failed:true, stdout:stdout, stderr:stderr }, undefined)
        else
            callback(undefined, { stdout:stdout, stderr:stderr })
    })
}

// An async, promise-based version of the above.
const spawn_pipe_file = util.promisify(spawn_pipe_file_cb)

class CacheEntry {
    constructor (contents, date, normalised_paths, size, type) {
        this.contents = contents
        this.date = date
        this.normalised_paths = normalised_paths
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
        this.max_buffer = options.cache.max_buffer
        this.max_entries = options.cache.max_entries
        this.max_size = options.cache.max_size
        this.options = options
        this.size = 0
    }

    async init() {
        // Get all the files currently in the cache directory
        const files = await fs.readdir(this.cache_dir)

        // Add them into the cache
        // Process in chunks so that the server isn't overwhelmed
        for (const batch of chunk(files, 4)) {
            await Promise.all(batch.map(async file => {
                const file_path = path.join(this.cache_dir, file)
                const parts = /(\w+)\.(.+)/.exec(file)
                const hash = parts[1]
                const stat = await fs.stat(file_path)
                const date = +stat.mtime
                const size = stat.size
                const type = parts[2]
                try {
                    const [contents, normalised_paths] = await this.list_contents(file_path, type)
                    const entry = new CacheEntry(contents, date, normalised_paths, size, type)
                    this.cache.set(hash, entry)
                    this.lru.push(hash)
                    this.size += size
                }
                catch (err) {
                    console.log(`Removing unreadable cache file ${file}: ${err}`)
                    try {
                        await fs.rm(file_path)
                    }
                    catch (_) {}
                }
            }))
        }

        console.log(`Cache initialized with ${this.lru.length} entries, ${this.size} bytes total`)
    }

    // Download and set up a cache entry
    async download(hash) {
        // Download the file
        const url = `https://${this.options.archive_domain}/if-archive/${this.index.hash_to_path.get(hash)}`
        const type = SUPPORTED_FORMATS.exec(url)[1].toLowerCase()
        const response = await fetch(url, {redirect: 'follow'})
        if (!response.ok) {
            throw new Error(`Error accessing ${url}: ${response.status}, ${response.statusText}`)
        }
        const file_path = this.file_path(hash, type)
        await pipeline(response.body, fs_sync.createWriteStream(file_path))

        // Wrap our processing in a try-catch so that we can remove the file if it fails for any reason
        let contents, date, normalised_paths, size
        try {
            // Parse the date
            const date_header = /\w+,\s+(\d+\s+\w+\s+\d+)/.exec(response.headers.get('last-modified'))
            if (!date_header) {
                throw new Error('Could not parse last-modified header')
            }
            date = new Date(`${date_header[1]} UTC`)

            // Reset the file's date
            await fs.utimes(file_path, date, date)

            // Get the file size
            size = (await fs.stat(file_path)).size
            this.size += size

            // Get the files inside
            ;[contents, normalised_paths] = await this.list_contents(file_path, type)
        }
        catch (e) {
            await fs.rm(file_path)
            throw e
        }

        // Update the cache, replacing the promise entry with a resolved entry object
        const entry = new CacheEntry(contents, +date, normalised_paths, size, type)
        this.cache.set(hash, entry)

        // Check the cache size
        if (this.size > this.max_size) {
            await this.evict()
        }
        return entry
    }

    // Evict old entries to make space for new ones
    // This checks both the number of entries and their total size. (Size is the total size of zip files, not the total unpacked size.) We discard old entries as long as we're over either limit.
    async evict() {
        while (this.lru.length > this.max_entries || this.size > this.max_size) {
            const hash = this.lru.pop()
            const entry = this.cache.get(hash)
            this.cache.delete(hash)
            this.size -= entry.size
            await fs.rm(this.file_path(hash, entry.type))
        }
    }

    // Return the path where the given Archive file is downloaded to.
    // (HASH.zip, HASH.tar.gz, etc in the cache dir.)
    file_path(hash, type) {
        return path.join(this.cache_dir, `${hash}.${type}`)
    }

    // Get a file out of the cache, or download it
    // This may immediately return the file entry, or it may return a promise that waits for it to be downloaded, but `await`ing the result will handle both seamlessly.
    async get(hash) {
        if (this.cache.has(hash)) {
            this.hit(hash)
            return this.cache.get(hash)
        }

        console.log(`Downloading cache entry ${hash} (${this.index.hash_to_path.get(hash)})`)

        // We add the promise to the cache even if it's pending. That way, future callers will get the same promise and will wait in parallel on it.
        // (It would be bad if two callers got different promises to the same hash, which then started to download to the same location.)
        this.lru.unshift(hash)
        const entry_promise = this.download(hash)
        this.cache.set(hash, entry_promise)

        // Check the cache length
        if (this.lru.length > this.max_entries) {
            await this.evict()
        }
        return entry_promise
    }

    // Extract a file from a zip, returning a buffer
    async get_file_buffer(hash, file_path, type, max_buffer) {
        const zip_path = this.file_path(hash, type)
        let command, command_opts
        switch (type) {
            case 'tar.gz':
            case 'tar.z':
            case 'tgz':
                command = 'tar'
                command_opts = type === 'tar.z' ? '-xOZf' : '-xOzf'
                break
            case 'zip':
                command = 'unzip'
                command_opts = '-p'
                break
            default:
                throw new Error(`Archive format ${type} not yet supported`)
        }
        const results = await execFile(command, [command_opts, zip_path, file_path], {
            encoding: 'buffer',
            maxBuffer: max_buffer ?? this.max_buffer,
        }).catch(err => {
            if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' && max_buffer) {
                return err
            }
            throw err
        })
        if (results.stderr.length) {
            console.log(`${file_path}: ${command} error: ${results.stderr.toString()}`)
        }
        if (results.failed) {
            throw new Error(`${file_path}: ${command} error: ${results.stderr.toString()}`)
        }
        return results.stdout
    }

    // Get a file from a zip, returning a stream
    get_file_stream(hash, file_path, type) {
        const zip_path = this.file_path(hash, type)
        let command, command_opts
        switch (type) {
            case 'tar.gz':
            case 'tar.z':
            case 'tgz':
                command = 'tar'
                command_opts = type === 'tar.z' ? '-xOZf' : '-xOzf'
                break
            case 'zip':
                command = 'unzip'
                command_opts = '-p'
                break
            default:
                throw new Error(`Archive format ${type} not yet supported`)
        }
        const child = child_process.spawn(command, [command_opts, zip_path, file_path])
        return child.stdout
    }

    // Run file on an extracted file
    async get_file_type(hash, file_path, type) {
        const zip_path = this.file_path(hash, type)
        let command, command_opts
        switch (type) {
            case 'tar.gz':
            case 'tar.z':
            case 'tgz':
                command = 'tar'
                command_opts = type === 'tar.z' ? '-xOZf' : '-xOzf'
                break
            case 'zip':
                command = 'unzip'
                command_opts = '-p'
                break
            default:
                throw new Error(`Archive format ${type} not yet supported`)
        }
        const results = await spawn_pipe_file(command, [command_opts, zip_path, file_path]).catch(err => { return err })
        if (results.stderr.length) {
            console.log(`${file_path}: ${command}|file error: ${results.stderr.toString()}`)
        }
        if (results.failed) {
            throw new Error(`${file_path}: ${command}|file error: ${results.stderr.toString()}`)
        }
        // Trim '/dev/stdin:'
        return results.stdout.trim().substring(12)
    }

    // Update the LRU list
    hit(hash) {
        const oldpos = this.lru.indexOf(hash)
        this.lru.splice(oldpos, 1)
        this.lru.unshift(hash)
    }

    // List the contents of a zip
    async list_contents(zip_path, type) {
        let command, results
        switch (type) {
            case 'tar.gz':
            case 'tar.z':
            case 'tgz':
                command = 'tar'
                results = await execFile('tar', ['-tf', zip_path]).catch(untar_error)
                break
            case 'zip':
                command = 'unzip'
                results = await execFile('unzip', ['-Z1', zip_path]).catch(unzip_error)
                break
            default:
                throw new Error(`Archive format ${type} not yet supported`)
        }
        if (results.stderr) {
            console.log(`${zip_path}: ${command} error: ${results.stderr.toString()}`)
        }
        if (results.failed) {
            throw new Error(`${zip_path}: ${command} error: ${results.stderr}`)
        }
        const contents = results.stdout
            .trim()
            .split('\n')
            .filter(line => !line.endsWith('/'))
            .sort()

        // Some archives need to have their file paths normalised, but store them so that we can extract the files later
        for (const file_path of contents) {
            if (file_path !== path.normalize(file_path)) {
                const normalised_paths = {}
                const new_contents = contents.map(file_path => {
                    const normalised_path = path.normalize(file_path)
                    normalised_paths[normalised_path] = file_path
                    return normalised_path
                })
                return [new_contents, normalised_paths]
            }
        }
        return [contents]
    }

    // Purge out of date files
    // The argument is a map of hash->timestamp, extracted from the Master-Index we just loaded
    async purge(data) {
        for (const [hash, entry] of this.cache) {
            if (entry instanceof CacheEntry && entry.date !== data.get(hash))
            {
                console.log(`Removing outdated cache file ${hash}.${entry.type} (${this.index.hash_to_path.get(hash)})`)
                this.cache.delete(hash)
                const oldpos = this.lru.indexOf(hash)
                this.lru.splice(oldpos, 1)
                this.size -= entry.size
                await fs.rm(this.file_path(hash, entry.type))
            }
        }

        // Check that we have the right number of cache entries
        const files = await fs.readdir(this.cache_dir)
        if (this.cache.size !== files.length || this.cache.size !== this.lru.length) {
            console.warn(`Cache has inconsistent data: ${this.cache.size} entries, ${this.lru.length} LRU entries, ${files.length} files`)
        }
    }
}
