/*

IF Archive Unboxing server
==========================

Copyright (c) 2021 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifarchive-unbox

*/

import Koa from 'koa'
import {router} from './router.js'

const app = new Koa()
export default app

app.use(router)