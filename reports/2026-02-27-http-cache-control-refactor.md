# HTTP Cache-Control Refactor Report

**Date:** 2026-02-27
**PR:** [#414](https://github.com/pinax-network/pinax-api/pull/414)
**Issue:** [#413](https://github.com/pinax-network/pinax-api/issues/413)

## Summary

Replaced ClickHouse's server-side query cache with standard HTTP `Cache-Control` headers, delegating all cache storage and invalidation to the reverse proxy layer (Caddy or Envoy). This gives infrastructure teams full control over caching behavior without application code changes.

## Motivation

The previous implementation used ClickHouse's built-in query cache (`use_query_cache`, `query_cache_ttl`) configured per-route in each handler. This approach had several drawbacks:

1. **Tight coupling** — Cache TTLs were hardcoded in route handlers alongside query logic
2. **Limited control** — No way for infrastructure to tune caching without code changes
3. **No proxy integration** — Reverse proxies (Caddy, Envoy) couldn't cache responses since no HTTP cache headers were emitted
4. **ClickHouse-specific** — Cache behavior was tied to a single database vendor's implementation

## Design Decisions

### Two-tier caching model

- **Default tier (1s):** All `/v1/*` API routes automatically receive `Cache-Control: public, max-age=1, s-maxage=1`. This provides a minimal deduplication window for burst traffic without serving significantly stale data.
- **Extended tier (configurable):** Specific data routes (holders, tokens, pools, DEXs, NFT collections) receive the full cache headers configured via environment variables, including `stale-while-revalidate`.

### Environment variables over code changes

All cache parameters are configurable via environment variables with sensible defaults:

| Variable | Description | Default |
|----------|-------------|---------|
| `CACHE_DISABLE` | Disable all Cache-Control headers | `false` |
| `CACHE_SERVER_MAX_AGE` | `s-maxage` for shared/proxy caches | `600` |
| `CACHE_MAX_AGE` | `max-age` for browser caches | `60` |
| `CACHE_STALE_WHILE_REVALIDATE` | RFC 5861 stale window | `30` |

### Header format

Extended-tier responses emit:

```
Cache-Control: public, max-age=60, s-maxage=600, stale-while-revalidate=30
```

Default-tier responses emit:

```
Cache-Control: public, max-age=1, s-maxage=1
```

## HTTP Caching Standards

### Cache-Control directives used

| Directive | RFC | Purpose |
|-----------|-----|---------|
| `public` | [RFC 7234 §5.2.2.6](https://httpwg.org/specs/rfc7234.html#cache-response-directive.public) | Allows shared caches (proxies) to store the response |
| `max-age` | [RFC 7234 §5.2.2.8](https://httpwg.org/specs/rfc7234.html#cache-response-directive.max-age) | Maximum time (seconds) a browser cache may use the response |
| `s-maxage` | [RFC 7234 §5.2.2.9](https://httpwg.org/specs/rfc7234.html#cache-response-directive.s-maxage) | Overrides `max-age` for shared caches — allows longer proxy TTLs than browser TTLs |
| `stale-while-revalidate` | [RFC 5861 §3](https://datatracker.ietf.org/doc/html/rfc5861#section-3) | After TTL expires, proxy may serve stale for this window while revalidating in the background |

### Why no ETag

ETag/`If-None-Match` was intentionally removed. Response bodies include dynamic metadata (`request_time`, `duration_ms`, `statistics`) that change on every request, producing a different hash each time. This means `If-None-Match` would never match and clients would never receive `304 Not Modified`. Additionally, the server still runs the full ClickHouse query to compute the ETag, so there's no backend CPU savings — only bandwidth savings on a `304`. For an API behind a CDN with `s-maxage=600`, most requests won't even reach the origin, making ETags practically useless. Time-based caching via `Cache-Control` is the appropriate strategy.

### stale-while-revalidate (RFC 5861)

From [RFC 5861](https://datatracker.ietf.org/doc/html/rfc5861):

> When present in an HTTP response, the stale-while-revalidate Cache-Control extension indicates that caches MAY serve the response in which it appears after it becomes stale, up to the indicated number of seconds.

**How it works in practice:**

1. Client requests `/v1/evm/transfers`
2. Proxy has a cached response that expired 10 seconds ago
3. Because `stale-while-revalidate=30`, the proxy immediately serves the stale response
4. Proxy asynchronously fetches a fresh response from the API
5. Next client gets the fresh response

This eliminates latency spikes on cache misses — the user always gets a fast response.

## Proxy Compatibility

### Caddy (with cache-handler)

[Caddy cache-handler](https://github.com/caddyserver/cache-handler) is a distributed HTTP cache module based on [Souin](https://github.com/darkweak/souin).

**Supports:**

- `Cache-Control` directives (`max-age`, `s-maxage`, `public`, `private`)
- `stale-while-revalidate` (RFC 5861) ✅
- ~~ETag / If-None-Match~~ (not used — see "Why no ETag" above)
- [RFC 7234](https://httpwg.org/specs/rfc7234.html) compliant
- [Cache-Status header](https://httpwg.org/http-extensions/draft-ietf-httpbis-cache-header.html) for debugging

**Minimal Caddyfile configuration:**

```
{
    order cache before rewrite
    cache
}

pinax-api.example.com {
    cache
    reverse_proxy localhost:8000
}
```

**Documentation:**

- Repository: <https://github.com/caddyserver/cache-handler>
- Souin docs: <https://docs.souin.io>
- Storages: <https://github.com/darkweak/storages>

### Envoy

Envoy provides a built-in [HTTP cache filter](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/cache_filter) using `SimpleHttpCache` (in-memory).

**Supports:**

- `Cache-Control` directives (`max-age`, `s-maxage`, `public`, `no-cache`, `no-store`) ✅
- ~~ETag / If-None-Match~~ (not used — see "Why no ETag" above)
- `Age` header on cached responses ✅

**Does NOT support (as of Envoy 1.38):**

- `stale-while-revalidate` ❌ — [Tracking issue: envoyproxy/envoy#14362](https://github.com/envoyproxy/envoy/issues/14362)
- `stale-if-error` ❌

The `stale-while-revalidate` header is emitted anyway for future compatibility and for other proxies in the chain.

**Minimal Envoy configuration:**

```yaml
http_filters:
  - name: envoy.filters.http.cache
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.cache.v3.CacheConfig
      typed_config:
        "@type": type.googleapis.com/envoy.extensions.http.cache.simple_http_cache.v3.SimpleHttpCacheConfig
```

**Documentation:**

- Cache filter: <https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/cache_filter>
- Cache sandbox: <https://www.envoyproxy.io/docs/envoy/latest/start/sandboxes/cache>
- SimpleHttpCache: in-memory only, no distributed/shared cache support

## Implementation Details

### Middleware architecture

Cache headers are applied via Hono middleware in `src/routes/index.ts`:

1. **`cacheControl()`** — registered on specific route patterns, sets full env-configured cache headers. Overwrites any existing `Cache-Control` header.

### Cached routes (extended tier)

All the following routes receive the full cache headers:

- `/v1/*/holders`, `/v1/*/holders/*`
- `/v1/*/dexes`
- `/v1/*/tokens`, `/v1/*/tokens/*`
- `/v1/*/pools`, `/v1/*/pools/ohlc`
- `/v1/*/transfers`, `/v1/*/transfers/*`
- `/v1/*/swaps`
- `/v1/*/balances`, `/v1/*/balances/*`
- `/v1/*/owner`
- `/v1/evm/nft/collections`, `/v1/evm/nft/holders`, `/v1/evm/nft/items`, `/v1/evm/nft/ownerships`, `/v1/evm/nft/sales`, `/v1/evm/nft/transfers`

### Bypass mechanisms

- **`CACHE_DISABLE=true`** — Disables all cache headers (both tiers)
- **`Cache-Control: no-cache` request header** — Client can opt out of caching per-request

### ClickHouse changes

- Removed all `use_query_cache`, `query_cache_ttl`, `query_cache_min_query_duration` settings from the ClickHouse client and all route handlers
- Removed `enable_shared_storage_snapshot_in_query: 0` workaround (now disabled server-side per infrastructure team)

## References

| Resource | URL |
|----------|-----|
| RFC 7234 — HTTP/1.1 Caching | <https://httpwg.org/specs/rfc7234.html> |
| RFC 5861 — HTTP Cache-Control Extensions for Stale Content | <https://datatracker.ietf.org/doc/html/rfc5861> |
| RFC 7232 — HTTP/1.1 Conditional Requests | <https://httpwg.org/specs/rfc7232.html> |
| MDN — Cache-Control | <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control> |
| Caddy cache-handler | <https://github.com/caddyserver/cache-handler> |
| Souin documentation | <https://docs.souin.io> |
| Envoy cache filter docs | <https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/cache_filter> |
| Envoy cache sandbox | <https://www.envoyproxy.io/docs/envoy/latest/start/sandboxes/cache> |
| Envoy stale-while-revalidate tracking | <https://github.com/envoyproxy/envoy/issues/14362> |
| ClickHouse PR #92118 (BlockIO bug) | <https://github.com/ClickHouse/ClickHouse/pull/92118> |
| ClickHouse PR #96995 (fix in 26.2) | <https://github.com/ClickHouse/ClickHouse/pull/96995> |
