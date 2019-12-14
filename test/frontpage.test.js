// Test the front page

import * as request from 'supertest'

import {app} from '../src/app'

let server

beforeEach(() => {
    server = app.listen(8081)
})

afterEach(async () => {
    await server.close()
})

describe('front page', () => {
    test('initial front page', async () =>
    {
        const response = await request(server).get('/')
        expect(response.status).toEqual(200)
        expect(response.text).toContain('IF Archive Unboxing Service')
        expect(response.text).toContain('Enter a URL from a zip file from the IF Archive to begin')
    })
})