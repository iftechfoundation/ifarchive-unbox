/*

IF Archive Unboxing server
==========================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

import {app} from './app.js'

export const server = app.listen(process.env.PORT || 8080)