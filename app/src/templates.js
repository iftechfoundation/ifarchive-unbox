/*

IF Archive Unboxing server - front page
=======================================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/iftechfoundation/ifarchive-unbox

*/

export function wrapper(content, title) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${title}IF Archive Unboxing Service</title>
    <link rel="stylesheet" href="https://ifarchive.org/misc/ifarchive.css">
</head>
<body>
    <div class="Page">
        <div class="Header">
            <h1><a href="/" style="text-decoration: none">IF Archive Unboxing Service</a></h1>
        </div>

        ${content}

        <div class="Footer">
            <p>The IF Archive is a public service of the <a href="https://iftechfoundation.org/">Interactive Fiction Technology Foundation</a>.</p>
            <p>The IF Archive Unboxing Service source code is on <a href="https://github.com/iftechfoundation/ifarchive-unbox">GitHub</a>.</p>
        </div>
    </div>
</body>
</html>`
}

export function error(msg) {
    return `
        <div style="text-align: center">
            <p><b>Error:</b> <pre style="font-size: 1.4em">${msg}</pre></p>
        </div>`
}

export function form() {
    return `
        <div style="text-align: center">
            <p>Enter a URL from a zip file from the <a href="https://ifarchive.org/">IF Archive</a> to begin:</p>
            <form action="/" method="get">
                <p><input style="font-size: 175%" type="text" name="url"> <button style="font-size: 175%" type="submit">Submit</button></p>
            </form>
        </div>`
}

export function list(path, hash, contents) {
    return `
        <div style="text-align: center">
            <h2>Contents of <a href="https://ifarchive.org/if-archive/${path}">${path}</a></h2>
            <div style="display: inline-block; margin: 0 auto; text-align: left">
                <ul>${contents.map(file => `<li><a href="/${hash}/${file}">${file}</a></li>`).join('\n')}</ul>
            </div>
        </div>`
}