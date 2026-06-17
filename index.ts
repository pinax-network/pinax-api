import { type Context, Hono } from 'hono';
import { compress } from 'hono/compress';
import './src/banner.js';
import { describeRoute, openAPIRouteHandler } from 'hono-openapi';
import { logServerInit } from './src/banner.js';
import { APP_DESCRIPTION, APP_VERSION, config } from './src/config.js';
import { logger } from './src/logger.js';
import routes from './src/routes/index.js';
import { APIErrorResponse } from './src/utils.js';
import { createX402Discovery } from './src/x402/discovery.js';

const app = new Hono();

// Response compression. Uses the runtime's CompressionStream — gzip and
// deflate negotiated via Accept-Encoding. Most responses on the API are
// JSON payloads that compress 5-10x; the OpenAPI document alone is
// ~540KB uncompressed.
app.use(compress());

// Tracking all incoming requests
app.use(async (c: Context, next) => {
    logger.trace(`Incoming request: '${c.req.path}'`);
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
const contentTypeJson = 'application/json; charset=UTF-8';
const skillsMarkdownFile = './skills/SKILL.md';
const markdownResponse = (path: string) =>
    new Response(Bun.file(path), { headers: { 'Content-Type': contentTypeMarkdown } });

const skillsMarkdownOpenapi = describeRoute({
    operationId: 'getSkillsMarkdown',
    summary: 'Pinax API Skill',
    description: 'Returns the Markdown reference for AI agents integrating with Pinax API.',
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
name: pinax-api
description: Query Pinax API datasets including Token API, prediction markets, and perp exchange data.
---

# Pinax API

> Quick reference for AI agents using Pinax API. The authoritative machine-readable contract is \`GET /openapi\`.

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
    description: 'Returns the llms.txt documentation index for AI tools discovering Pinax API.',
    tags: ['Documentation'],
    security: [],
    responses: {
        200: {
            description: 'Successful Response',
            content: {
                [contentTypeMarkdown]: {
                    schema: {
                        type: 'string',
                        example: `# Pinax API

> Real-time Token API, prediction market, and perp exchange data.

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
    description: 'Returns the OpenAPI specification for Pinax API.',
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

const x402DiscoveryOpenapi = describeRoute({
    operationId: 'getX402Discovery',
    summary: 'x402 Discovery',
    description:
        'Returns the x402 discovery document. Payment enforcement, verification, settlement, and metering are handled by the proxy layer.',
    tags: ['Documentation'],
    security: [],
    responses: {
        200: {
            description: 'Successful Response',
            content: {
                [contentTypeJson]: {
                    schema: {
                        type: 'object',
                        example: {
                            x402Version: 2,
                            name: 'Pinax API',
                            resourceServer: 'https://api.pinax.network',
                            payment: {
                                enforcement: 'proxy',
                            },
                            discovery: {
                                openapi: 'https://api.pinax.network/openapi',
                                llms: 'https://api.pinax.network/llms.txt',
                                skill: 'https://api.pinax.network/SKILL.md',
                            },
                            datasets: [],
                        },
                    },
                },
            },
        },
    },
});

app.get('/SKILL.md', skillsMarkdownOpenapi, () => markdownResponse(skillsMarkdownFile));
app.get('/skills/SKILL.md', (c) => c.redirect('/SKILL.md', 301));
app.get('/SKILLS.md', (c) => c.redirect('/SKILL.md', 301));
app.get('/skills.md', (c) => c.redirect('/SKILL.md', 301));
app.get('/skill.md', (c) => c.redirect('/SKILL.md', 301));
app.get('/llms.txt', llmsTextOpenapi, () => markdownResponse('./public/llms.txt'));
app.get('/.well-known/x402', x402DiscoveryOpenapi, (c) => c.json(createX402Discovery()));
app.get('/x402.json', (c) => c.redirect('/.well-known/x402', 301));
app.get(
    '/openapi',
    openapiSpecOpenapi,
    openAPIRouteHandler(app, {
        documentation: {
            info: {
                title: 'Pinax API',
                version: APP_VERSION,
                description:
                    'Power your apps and AI agents with real-time Token API, prediction market, and perp exchange data.',
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
                { name: 'Hyperliquid Outcomes' },
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
