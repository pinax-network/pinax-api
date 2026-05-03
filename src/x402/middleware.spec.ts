import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { config } from '../config.js';
import { x402PlanHeaderMiddleware } from './middleware.js';

describe('x402PlanHeaderMiddleware', () => {
    it('applies the configured paid plan when an x402 payment header is present', async () => {
        const previousEnabled = config.x402Enabled;
        const previousPlan = config.x402Plan;
        config.x402Enabled = true;
        config.x402Plan = 'pro';

        const app = new Hono();
        app.use('*', x402PlanHeaderMiddleware);
        app.get('/v1/evm/tokens', (ctx) => ctx.text(ctx.req.header('X-Plan') ?? 'missing'));

        const response = await app.request('/v1/evm/tokens', {
            headers: {
                'PAYMENT-SIGNATURE': 'signature',
            },
        });

        expect(await response.text()).toBe('pro');

        config.x402Enabled = previousEnabled;
        config.x402Plan = previousPlan;
    });

    it('leaves the plan untouched when x402 is disabled', async () => {
        const previousEnabled = config.x402Enabled;
        config.x402Enabled = false;

        const app = new Hono();
        app.use('*', x402PlanHeaderMiddleware);
        app.get('/v1/evm/tokens', (ctx) => ctx.text(ctx.req.header('X-Plan') ?? 'missing'));

        const response = await app.request('/v1/evm/tokens', {
            headers: {
                'PAYMENT-SIGNATURE': 'signature',
            },
        });

        expect(await response.text()).toBe('missing');

        config.x402Enabled = previousEnabled;
    });
});
