import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { GIT_APP } from '../config.js';
import { withErrorResponses } from '../utils.js';

const route = new Hono();

const responseSchema = z.object({
    version: z.string(),
    date: z.string(),
    commit: z.string(),
});

const openapi = describeRoute(
    withErrorResponses({
        summary: 'API Version',
        description: 'Returns the API version, build date, and commit hash.',
        tags: ['Monitoring'],
        responses: {
            200: {
                description: 'Successful Response',
                content: {
                    'application/json': { schema: resolver(responseSchema), examples: { example: { value: GIT_APP } } },
                },
            },
        },
    })
);

route.get('/version', openapi, (c) => {
    return c.json(GIT_APP);
});

export default route;
