/*

IF Archive Unboxing server
==========================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

import Koa from 'koa'
import {router} from './router.js'

export const app = new Koa()

app.use(router)