import { type Context, Hono } from 'hono';
import './src/banner.js';
import { describeRoute, openAPIRouteHandler } from 'hono-openapi';
import { logServerInit } from './src/banner.js';
import { APP_DESCRIPTION, APP_VERSION, config } from './src/config.js';
import { logger } from './src/logger.js';
import routes from './src/routes/index.js';
import { APIErrorResponse } from './src/utils.js';

const app = new Hono();

// Tracking all incoming requests
app.use(async (c: Context, next) => {
    const pathname = c.req.path;
    logger.trace(`Incoming request: '${pathname}'`);

    // Set `X-Plan` to free by default if none received
    // This will have no effect unless `config.plans` is setup through ENV or CLI
    if (!c.req.header('X-Plan')) c.req.raw.headers.set('X-Plan', 'free');

    await next();
});

// -----------
// --- API ---
// -----------
app.route('/', routes);

// ------------
// --- Docs ---
// ------------
app.get('/', () => new Response(Bun.file('./public/index.html')));
app.get('/favicon.svg', () => new Response(Bun.file('./public/favicon.svg')));
app.get('/banner.jpg', () => new Response(Bun.file('./public/banner.jpg')));

const contentTypeMarkdown = 'text/markdown; charset=UTF-8';

const skillsMarkdownOpenapi = describeRoute({
    operationId: 'getSkillsMarkdown',
    summary: 'Agent Skills Reference',
    description: 'Returns the public Markdown reference for AI agents integrating with Token API.',
    tags: ['Documentation'],
    security: [],
    responses: {
        200: {
            description: 'Successful Response',
            content: {
                [contentTypeMarkdown]: {
                    schema: {
                        type: 'string',
                        example: `---
name: Token API
description: Real-time token, balance, transfer, holder, DEX, NFT, Polymarket, and Hyperliquid data across EVM, SVM, and TVM networks.
---

# Token API

> Quick reference for AI agents using Token API. The authoritative machine-readable contract is \`GET /openapi\`.

...`,
                    },
                },
            },
        },
    },
});

const llmsTextOpenapi = describeRoute({
    operationId: 'getLlmsText',
    summary: 'LLM Documentation Index',
    description: 'Returns the public llms.txt documentation index for AI tools discovering Token API.',
    tags: ['Documentation'],
    security: [],
    responses: {
        200: {
            description: 'Successful Response',
            content: {
                [contentTypeMarkdown]: {
                    schema: {
                        type: 'string',
                        example: `# Token API

> Real-time token, balance, transfer, holder, DEX, NFT, Polymarket, and Hyperliquid data across EVM, SVM, and TVM networks.

...`,
                    },
                },
            },
        },
    },
});

const openapiSpecOpenapi = describeRoute({
    operationId: 'getOpenapiSpec',
    summary: 'OpenAPI Specification',
    description: 'Returns the public OpenAPI specification for Token API.',
    tags: ['Documentation'],
    security: [],
    responses: {
        200: {
            description: 'Successful Response',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        example: {
                            openapi: '3.1.0',
                            info: {},
                            servers: [],
                            paths: {},
                            components: {},
                            tags: [],
                        },
                    },
                },
            },
        },
    },
});

app.get(
    '/SKILLS.md',
    skillsMarkdownOpenapi,
    () => new Response(Bun.file('./public/skills.md'), { headers: { 'Content-Type': contentTypeMarkdown } })
);
app.get(
    '/skills.md',
    () => new Response(Bun.file('./public/skills.md'), { headers: { 'Content-Type': contentTypeMarkdown } })
);
app.get('/skill.md', (c) => c.redirect('/skills.md', 301));
app.get('/SKILL.md', (c) => c.redirect('/SKILLS.md', 301));
app.get(
    '/llms.txt',
    llmsTextOpenapi,
    () => new Response(Bun.file('./public/llms.txt'), { headers: { 'Content-Type': contentTypeMarkdown } })
);
app.get(
    '/openapi',
    openapiSpecOpenapi,
    openAPIRouteHandler(app, {
        documentation: {
            info: {
                title: 'Token API',
                version: APP_VERSION,
                description: 'Power your apps & AI agents with real-time token data.',
            },
            servers: config.disableOpenapiServers
                ? [{ url: `http://${config.hostname}:${config.port}`, description: `${APP_DESCRIPTION} - Local` }]
                : [{ url: config.apiUrl, description: `${APP_DESCRIPTION} - Remote` }],
            tags: [
                // Documentation
                { name: 'Documentation' },
                // SVM
                { name: 'SVM Tokens' },
                { name: 'SVM Tokens (Native)' },
                { name: 'SVM DEXs' },
                // EVM
                { name: 'EVM Tokens (ERC-20)' },
                { name: 'EVM Tokens (Native)' },
                { name: 'EVM DEXs' },
                { name: 'EVM NFTs' },
                // TVM
                { name: 'TVM Tokens (ERC-20)' },
                { name: 'TVM Tokens (Native)' },
                { name: 'TVM DEXs' },
                // Polymarket
                { name: 'Polymarket Markets' },
                { name: 'Polymarket Platform' },
                { name: 'Polymarket Users' },
                // Hyperliquid
                { name: 'Hyperliquid Markets' },
                { name: 'Hyperliquid Users' },
                { name: 'Hyperliquid Vaults' },
                { name: 'Hyperliquid Platform' },
                // Monitoring
                { name: 'Monitoring' },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                    apiKeyAuth: {
                        type: 'apiKey',
                        in: 'header',
                        name: 'X-Api-Key',
                    },
                },
            },
        },
        excludeStaticFile: false,
    })
);

// 404 NOT FOUND
app.notFound((c: Context) =>
    APIErrorResponse(c, 404, 'route_not_found', `Path not found: ${c.req.method} ${c.req.path}`)
);

logServerInit();

export default {
    ...app,
    idleTimeout: config.idleTimeout,
};
