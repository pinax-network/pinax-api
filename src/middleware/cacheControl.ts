import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { hasPaymentHeader, LEGACY_PAYMENT_RESPONSE_HEADER, PAYMENT_RESPONSE_HEADER } from '../x402/accessPass.js';

/**
 * Hono middleware that adds HTTP Cache-Control headers to cacheable responses.
 *
 * Headers emitted (on 200 responses):
 *   Cache-Control: public, max-age=<CACHE_MAX_AGE>, s-maxage=<CACHE_SERVER_MAX_AGE>, stale-while-revalidate=<CACHE_STALE_WHILE_REVALIDATE>
 *
 * Behaviour:
 * - When `CACHE_DISABLE=true`, no cache headers are emitted.
 * - When the request includes `Cache-Control: no-cache`, no cache headers are emitted.
 * - When the request/response carries x402 payment state, no shared cache headers are emitted.
 *
 * Note: ETag/If-None-Match is intentionally omitted — response bodies include dynamic
 * metadata (request_time, duration_ms, statistics) that change on every request, making
 * ETags ineffective. Time-based caching via Cache-Control + proxy s-maxage is the
 * appropriate strategy for this API.
 *
 * Environment variables (all in seconds):
 *   CACHE_SERVER_MAX_AGE  – `s-maxage` for shared/proxy caches (Caddy, Envoy). Default: 600
 *   CACHE_MAX_AGE         – `max-age` for browser caches. Default: 60
 *   CACHE_STALE_WHILE_REVALIDATE – RFC 5861 stale-while-revalidate window. Default: 30
 *
 * Routes with `cacheControl()` get the full env-configured TTLs.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5861
 */
export function cacheControl() {
    return async (ctx: Context, next: Next) => {
        await next();

        // Skip cache headers if caching is disabled
        if (config.cacheDisable) return;

        // Skip cache headers if client requests no-cache
        if (ctx.req.header('Cache-Control') === 'no-cache') return;

        // Skip cache headers for paid responses; access is tied to payment receipt state.
        if (
            hasPaymentHeader(ctx.req.raw.headers) ||
            ctx.res.headers.has(PAYMENT_RESPONSE_HEADER) ||
            ctx.res.headers.has(LEGACY_PAYMENT_RESPONSE_HEADER)
        ) {
            return;
        }

        // Only cache successful responses
        if (ctx.res.status !== 200) return;

        const { cacheServerMaxAge, cacheMaxAge, cacheStaleWhileRevalidate } = config;

        ctx.res.headers.set(
            'Cache-Control',
            `public, max-age=${cacheMaxAge}, s-maxage=${cacheServerMaxAge}, stale-while-revalidate=${cacheStaleWhileRevalidate}`
        );
    };
}
