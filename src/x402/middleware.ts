import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from '@x402/core/server';
import type { Network, PaymentPayload } from '@x402/core/types';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import { paymentIdentifierResourceServerExtension } from '@x402/extensions/payment-identifier';
import { paymentMiddlewareFromHTTPServer } from '@x402/hono';
import { ExactSvmScheme } from '@x402/svm/exact/server';
import type { MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import {
    cacheSettledAccessPass,
    getPaymentHeader,
    getPaymentIdentifierFromHeader,
    x402AccessPassStore,
} from './accessPass.js';
import { createX402RouteConfig, isX402ProtectedRoute } from './routes.js';

const passthroughMiddleware: MiddlewareHandler = async (_ctx, next) => {
    await next();
};

export const x402PlanHeaderMiddleware: MiddlewareHandler = async (ctx, next) => {
    if (
        config.x402Enabled &&
        isX402ProtectedRoute(ctx.req.method, ctx.req.path) &&
        getPaymentHeader(ctx.req.raw.headers)
    ) {
        ctx.req.raw.headers.set('X-Plan', config.x402Plan);
    }

    await next();
};

export function createX402PaymentMiddleware(): MiddlewareHandler {
    if (!config.x402Enabled) return passthroughMiddleware;

    const facilitatorClient = new HTTPFacilitatorClient({
        url: config.x402FacilitatorUrl,
    });
    const routeConfig = createX402RouteConfig(config);
    const resourceServer = new x402ResourceServer(facilitatorClient)
        .register(config.x402EvmNetwork as Network, new ExactEvmScheme())
        .register(config.x402SvmNetwork as Network, new ExactSvmScheme())
        .registerExtension(paymentIdentifierResourceServerExtension)
        .registerExtension(bazaarResourceServerExtension)
        .onAfterSettle(async (settleContext) => {
            cacheSettledAccessPass(
                settleContext.paymentPayload as PaymentPayload,
                settleContext.result,
                config.x402PassDurationSeconds
            );
        });

    const httpServer = new x402HTTPResourceServer(resourceServer, routeConfig).onProtectedRequest(async (request) => {
        if (!request.paymentHeader) return;

        const paymentId = getPaymentIdentifierFromHeader(request.paymentHeader);
        if (paymentId && x402AccessPassStore.get(paymentId)) return { grantAccess: true };

        // Cache misses fall through to the facilitator-backed verification flow.
        // This lets restarted or separate containers rebuild local state when the facilitator accepts the receipt.
    });

    return paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, config.x402SyncFacilitatorOnStart);
}

export const x402PaymentMiddleware = createX402PaymentMiddleware();
