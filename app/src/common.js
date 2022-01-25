/*

IF Archive common constants and functions
=========================================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

*/

// Maps familiar file suffixes to MIME types.
export const COMMON_FILE_TYPES = {
    blb: 'application/x-blorb',
    blorb: 'application/x-blorb',
    css: 'text/css',
    gam: 'application/x-tads',
    gblorb: 'application/x-blorb;profile="glulx"',
    gif: 'image/gif',
    glb: 'application/x-blorb;profile="glulx"',
    htm: 'text/html',
    html: 'text/html',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    js: 'application/javascript',
    png: 'image/png',
    t3: 'application/x-t3vm-image',
    txt: 'text/plain',
    ulx: 'application/x-glulx',
    zblorb: 'application/x-blorb;profile="zcode"',
    zlb: 'application/x-blorb;profile="zcode"',
    z3: 'application/x-zmachine',
    z4: 'application/x-zmachine',
    z5: 'application/x-zmachine',
    z6: 'application/x-zmachine',
    z7: 'application/x-zmachine',
    z8: 'application/x-zmachine',
}

// Regex: what package formats do we handle?
export const SUPPORTED_FORMATS = /\.(tar\.gz|tgz|zip)$/i

// List of types where we need to do additional work to get the character set headers right.
export const TYPES_TO_DETECT_BETTER = [
    'application/octet-stream',
    'text/html',
    'text/plain',
]

// Regex: what file types must be handled by a subdomain?
// (HTML and SVG can have scripting, so they must be isolated. Media files can be on the main domain so that the CDN can cache them.)
export const UNSAFE_FILES = /\.(html?|svg)$/i

// Escape for use inside a regular expression
// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
export function escape_regexp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}

// Escape for use inside of a single quoted shell argument
export function escape_shell_single_quoted(str) {
    return str.replace(/'/g, `'\\''`)
}
