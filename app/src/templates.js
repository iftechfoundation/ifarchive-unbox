/*

IF Archive Unboxing server - front page
=======================================

Copyright (c) 2024 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

As you can see, this file contains HTML templates for the Unbox front end.

*/

import {escape} from 'lodash-es'

import {UNSAFE_FILES} from './common.js'

function escape_url_segment(path) {
    const replacements = path.replaceAll('#', '%23').replaceAll('?', '%3F')
    return escape(replacements)
}

function slashbreak(path) {
    return path.replaceAll('/', '/<wbr>')
}

export function wrapper(opts) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${opts.title ? `${escape(opts.title)} - `: ''}IF Archive Unboxing Service</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://ifarchive.org/misc/ifarchive.css">
    ${opts.canonical ? `<link rel="canonical" href="${opts.canonical}">` : ''}
    <script src="https://ifarchive.org/misc/darkmode.js" type="text/javascript"></script>
</head>
<body class="SysMode">
    <div id="unboxpage" class="Page">
        <div class="Header">
            <h1><a href="/">IF Archive Unboxing Service</a></h1>
        </div>

        ${opts.content}

        <div class="Footer">
            <p>The <a href="https://ifarchive.org/">IF Archive</a> is a public service of the <a href="https://iftechfoundation.org/">Interactive Fiction Technology Foundation</a>.</p>
            <p><a href="https://github.com/iftechfoundation/ifarchive-unbox">About the Unboxing Service</a>
                <span id="jsdash" class="Hide">-</span>
                <button id="toggletheme" class="FootWidget Hide">&#x25D0; Theme</button>
            </p>
        </div>
    </div>
</body>
</html>`
}

export function error(msg) {
    return `
        <div class="Description">
            <p><b>Error:</b></p>
            <p class="Error">${escape(msg)}</p>
        </div>`
}

export function form() {
    return `
        <div class="Description">
            <p>Enter the URL of a zip or tar file from the <a href="https://ifarchive.org/">IF Archive</a>:</p>
            <form class="InputForm" action="/" method="get">
                <p><input class="InputLine" type="text" name="url"> <button class="Button UrlButton" type="submit">Submit</button></p>
            </form>
        </div>`
}

export function list(opts) {
    function make_url(file) {
        return `${opts.subdomains && UNSAFE_FILES.test(file) ? `//${opts.hash}.${opts.domain}` : ''}/${opts.hash}/${escape_url_segment(file)}`
    }

    const listcontents = opts.files.map(file => `<li><a href="${make_url(file)}">${slashbreak(escape(file))}</a></li>`).join('\n')
    return `
        <div class="Description">
            ${opts.starthtml ? `<form class="StartForm" action="${make_url(opts.starthtml)}"><button class="Button StartButton" type="submit">Open ${slashbreak(escape(opts.starthtml))}</button></form>` : ''}
            <h2>${escape(opts.label)} <a href="https://ifarchive.org/if-archive/${opts.path}">${slashbreak(escape(opts.path))}</a></h2>
            ${listcontents.length ? `<div class="ListBox">
                <ul>${listcontents}</ul>
            </div>` : '<p>No matching files</p>'}
            ${opts.alllink ? `<p><a href="/?url=https://ifarchive.org/if-archive/${opts.path}">See all files</a></p>` : ''}
        </div>`
}
