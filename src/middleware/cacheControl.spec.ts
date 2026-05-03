import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from '../config.js';
import { cacheControl } from './cacheControl.js';

describe('cacheControl', () => {
    it('sets public cache headers on successful cacheable responses', async () => {
        const previousDisable = config.cacheDisable;
        config.cacheDisable = false;

        const app = new Hono();
        app.use('*', cacheControl());
        app.get('/', (ctx) => ctx.text('ok'));

        const response = await app.request('/');

        expect(response.headers.get('Cache-Control')).toContain('public');

        config.cacheDisable = previousDisable;
    });

    it('does not set public cache headers for x402 paid requests', async () => {
        const previousDisable = config.cacheDisable;
        config.cacheDisable = false;

        const app = new Hono();
        app.use('*', cacheControl());
        app.get('/', (ctx) => ctx.text('ok'));

        const response = await app.request('/', {
            headers: {
                'PAYMENT-SIGNATURE': 'signature',
            },
        });

        expect(response.headers.get('Cache-Control')).toBeNull();

        config.cacheDisable = previousDisable;
    });
});
