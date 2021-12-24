/*

IF Archive common constants and functions
=========================================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

*/

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
    z8: 'application/x-zmachine',
}

export const SUPPORTED_FORMATS = /\.(tar\.gz|zip)$/i

export const TYPES_TO_DETECT_BETTER = [
    'application/octet-stream',
    'text/html',
    'text/plain',
]

export const UNSAFE_FILES = /\.(html?|svg)$/i

// Escape for use inside of a single quoted shell argument
export function escape_shell_single_quoted(str) {
    return str.replace(/'/g, `'\\''`)
}