/*
Repro / regression check for https://github.com/iftechfoundation/ifarchive-unbox/issues/70

Concurrent cache fills can make FileCache.size become NaN (evict pops a still-
pending download Promise and does `this.size -= entry.size`). After that,
size-based eviction never runs again, so the on-disk zip cache grows past
max_size.

This harness only fakes the network write. Size accounting, list_contents,
cache.set, and evict all run through real FileCache.finalize_download() /
get() / evict().

Usage (from app/):
  node repro-issue-70-cache-limit.js

Exit 0 = PASS (limits held). Exit 1 = FAIL (size accounting broken).
*/

import child_process from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import util from 'util'

import FileCache from './src/cache.js'

const execFile = util.promisify(child_process.execFile)

const FILE_BYTES = 1_000_000 // ~1 MB per zip (payload padded to this size)
const MAX_SIZE = 3_000_000   // 3 MB → at most 3 files if size eviction works
const MAX_ENTRIES = 3
const BURST = 5              // concurrent gets to force evict of a pending Promise
const EXTRA_AFTER = 4        // more downloads after size is corrupted
const DOWNLOAD_DELAY_MS = 150

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function dirSize(dir) {
    const files = await fs.readdir(dir)
    let total = 0
    for (const f of files) {
        total += (await fs.stat(path.join(dir, f))).size
    }
    return total
}

// Build one real zip of about FILE_BYTES so list_contents() works unchanged.
async function build_fixture_zip() {
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'unbox-issue70-fixture-'))
    const payload_path = path.join(staging, 'index.html')
    const zip_path = path.join(staging, 'fixture.zip')
    const fh = await fs.open(payload_path, 'w')
    await fh.truncate(FILE_BYTES)
    await fh.close()
    await execFile('zip', ['-0', '-q', zip_path, 'index.html'], {cwd: staging})
    const zip_bytes = await fs.readFile(zip_path)
    await fs.rm(staging, {recursive: true, force: true})
    return zip_bytes
}

async function main() {
    const fixture_zip = await build_fixture_zip()
    const data_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'unbox-issue70-'))
    await fs.mkdir(path.join(data_dir, 'cache'))

    const cache = new FileCache(data_dir, {
        archive_domain: 'ifarchive.org',
        cache: {
            max_buffer: 1_000_000,
            max_entries: MAX_ENTRIES,
            max_size: MAX_SIZE,
        },
    })
    await cache.init()

    const hashes = Array.from({length: BURST + EXTRA_AFTER}, (_, i) => `repro${i}`)
    cache.index = {
        hash_to_path: new Map(hashes.map(h => [h, `games/repro/${h}.zip`])),
        hash_to_date: new Map(hashes.map(h => [h, Date.now()])),
    }

    // Slow fake download: sleep, write a real zip, then finalize.
    cache.download = async function download(hash) {
        await sleep(DOWNLOAD_DELAY_MS + Math.random() * 100)
        const type = 'zip'
        const file_path = this.file_path(hash, type)
        await fs.writeFile(file_path, fixture_zip)
        return this.finalize_download(hash, file_path, type)
    }

    console.log('Limits:', {max_size: MAX_SIZE, max_entries: MAX_ENTRIES, fixture_zip_bytes: fixture_zip.length})
    console.log(`Phase 1: ${BURST} concurrent get() calls (triggers evict while downloads are pending)\n`)

    const burst = hashes.slice(0, BURST)
    const burst_results = await Promise.allSettled(burst.map(h => cache.get(h)))
    const burst_rejected = burst_results.filter(r => r.status === 'rejected').length

    console.log('After burst:', {
        tracked_size: cache.size,
        size_is_nan: Number.isNaN(cache.size),
        disk_size: await dirSize(cache.cache_dir),
        cache_entries: cache.cache.size,
        lru_entries: cache.lru.length,
        rejected_gets: burst_rejected,
    })

    console.log(`\nPhase 2: ${EXTRA_AFTER} more downloads (should be size-evicted if accounting worked)\n`)
    for (const h of hashes.slice(BURST)) {
        try {
            await cache.get(h)
        }
        catch (err) {
            console.log(`get(${h}) failed: ${err.message}`)
        }
    }

    const disk_size = await dirSize(cache.cache_dir)
    const summary = {
        tracked_size: cache.size,
        size_is_nan: Number.isNaN(cache.size),
        disk_size,
        max_size: MAX_SIZE,
        over_limit_disk: disk_size > MAX_SIZE,
        cache_entries: cache.cache.size,
        lru_entries: cache.lru.length,
    }

    console.log('\nFinal:', summary)
    console.log('\nExpected: disk_size <= max_size, tracked_size is a finite number')
    console.log(`Actual:   disk_size=${disk_size} max_size=${MAX_SIZE}, tracked_size=${cache.size}`)

    await fs.rm(data_dir, {recursive: true, force: true})

    if (Number.isNaN(cache.size) || disk_size > MAX_SIZE) {
        console.log('\nFAIL: zip cache exceeded max_size (size accounting broken)')
        process.exitCode = 1
    }
    else {
        console.log('\nPASS: cache stayed within max_size')
        process.exitCode = 0
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
