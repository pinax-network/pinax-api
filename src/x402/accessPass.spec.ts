import { describe, expect, it } from 'bun:test';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import type { Network, PaymentPayload, SettleResponse } from '@x402/core/types';
import { PAYMENT_IDENTIFIER } from '@x402/extensions/payment-identifier';
import {
    cacheSettledAccessPass,
    getPaymentHeader,
    getPaymentIdentifierFromHeader,
    X402AccessPassStore,
    x402AccessPassStore,
} from './accessPass.js';

const paymentPayload: PaymentPayload = {
    x402Version: 2,
    accepted: {
        scheme: 'exact',
        network: 'eip155:8453' as Network,
        asset: 'USDC',
        amount: '100000',
        payTo: '0x49D581486438aAD93f4114084Ac5B09A8b7C9685',
        maxTimeoutSeconds: 120,
        extra: {},
    },
    payload: {},
    extensions: {
        [PAYMENT_IDENTIFIER]: {
            info: {
                required: true,
                id: 'pay_1234567890abcdef',
            },
        },
    },
};

const settleResponse: SettleResponse = {
    success: true,
    transaction: '0xsettled',
    network: 'eip155:8453' as Network,
    amount: '100000',
    payer: '0xpayer',
};

describe('X402AccessPassStore', () => {
    it('returns a valid pass and prunes expired passes', () => {
        const store = new X402AccessPassStore();

        store.set({
            id: 'pay_1234567890abcdef',
            transaction: '0xsettled',
            network: 'eip155:8453',
            createdAt: 1_000,
            expiresAt: 2_000,
        });

        expect(store.get('pay_1234567890abcdef', 1_500)?.transaction).toBe('0xsettled');
        expect(store.get('pay_1234567890abcdef', 2_000)).toBeUndefined();
        expect(store.size(2_000)).toBe(0);
    });
});

describe('x402 access pass helpers', () => {
    it('extracts the payment identifier from a payment signature header', () => {
        const header = encodePaymentSignatureHeader(paymentPayload);

        expect(getPaymentIdentifierFromHeader(header)).toBe('pay_1234567890abcdef');
    });

    it('returns undefined for malformed payment headers', () => {
        expect(getPaymentIdentifierFromHeader('not-base64-json')).toBeUndefined();
    });

    it('reads both v2 and legacy payment headers', () => {
        const headers = new Headers({ 'X-PAYMENT': encodePaymentSignatureHeader(paymentPayload) });

        expect(getPaymentHeader(headers)).toBeDefined();
    });

    it('caches settled payments for the configured duration', () => {
        x402AccessPassStore.clear();

        const pass = cacheSettledAccessPass(paymentPayload, settleResponse, 3600, 1_000);

        expect(pass).toMatchObject({
            id: 'pay_1234567890abcdef',
            transaction: '0xsettled',
            expiresAt: 3_601_000,
        });
        expect(x402AccessPassStore.get('pay_1234567890abcdef', 3_600_999)).toBeDefined();
        x402AccessPassStore.clear();
    });
});
