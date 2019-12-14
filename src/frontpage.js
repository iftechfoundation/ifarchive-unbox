/*

IF Archive Unboxing server - front page
=======================================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

export function wrapper(content) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>IF Archive Unboxing Service</title>
    <link rel="stylesheet" href="https://ifarchive.org/misc/ifarchive.css">
</head>
<body>
    <div class="Page">
        <div class="Header">
            <h1>IF Archive Unboxing Service</h1>
        </div>

        ${content}

        <div class="Footer">
            <p>The IF Archive is a public service of the <a href="https://iftechfoundation.org/">Interactive Fiction Technology Foundation</a>.</p>
            <p>The IF Archive Unboxing Service source code is on <a href="https://github.com/curiousdannii/ifarchive-unbox">GitHub</a>.</p>
        </div>
    </div>
</body>
</html>`
}

export function form() {
    return `
        <div style="text-align: center">
            <p>Enter a URL from a zip file from the IF Archive to begin:</p>
            <form action="/" method="get">
                <p><input style="font-size: 175%" type="text" name="url"> <button style="font-size: 175%" type="submit">Submit</button></p>
            </form>
        </div>`
}