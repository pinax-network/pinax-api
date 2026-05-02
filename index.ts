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
                'text/markdown': {
                    schema: {
                        type: 'string',
                        example: '# Token API',
                    },
                },
            },
        },
    },
});

app.get(
    '/skills.md',
    skillsMarkdownOpenapi,
    () => new Response(Bun.file('./public/skills.md'), { headers: { 'Content-Type': 'text/markdown; charset=UTF-8' } })
);
app.get(
    '/openapi',
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
