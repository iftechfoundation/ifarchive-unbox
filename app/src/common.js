/*

IF Archive common constants and functions
=========================================

Copyright (c) 2022 Dannii Willis
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
export const SUPPORTED_FORMATS = /\.(tar\.gz|tgz|tar\.z|zip)$/i

// MIME types that don't need to be no-transform
// Cloudflare compresses only a small list of MIME types, and they don't include any of our storyfile formats
// This is the list of types that we can pass through to Cloudflare without a no-transform header,
// either because Cloudflare will compress them, or because they're already compressed
// From https://support.cloudflare.com/hc/en-us/articles/200168396-What-will-Cloudflare-compress-
export const TYPES_THAT_ARENT_NO_TRANSFORM = `text/html
text/richtext
text/plain
text/css
text/x-script
text/x-component
text/x-java-source
text/x-markdown
application/javascript
application/x-javascript
text/javascript
text/js
image/x-icon
image/vnd.microsoft.icon
application/x-perl
application/x-httpd-cgi
text/xml
application/xml
application/xml+rss
application/vnd.api+json
application/x-protobuf
application/json
multipart/bag
multipart/mixed
application/xhtml+xml
font/ttf
font/otf
font/x-woff
image/svg+xml
application/vnd.ms-fontobject
application/ttf
application/x-ttf
application/otf
application/x-otf
application/truetype
application/opentype
application/x-opentype
application/font-woff
application/eot
application/font
application/font-sfnt
application/wasm
application/javascript-binast
application/manifest+json
application/ld+json`.split('\n')
// But also don't compress images, music, zips etc
.concat([
    'application/gzip',
    'application/java-archive',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/zip',
    'audio/mpeg',
    'audio/ogg',
    'audio/webm',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'image/webp',
    'video/mp4',
    'video/mpeg',
    'video/ogg',
    'video/webm',
])

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