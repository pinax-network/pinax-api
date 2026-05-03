import { decodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentPayload, SettleResponse } from '@x402/core/types';
import { extractPaymentIdentifier } from '@x402/extensions/payment-identifier';

export const PAYMENT_SIGNATURE_HEADER = 'PAYMENT-SIGNATURE';
export const LEGACY_PAYMENT_HEADER = 'X-PAYMENT';
export const PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE';
export const LEGACY_PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE';

export type X402AccessPass = {
    id: string;
    payer?: string;
    transaction: string;
    network: string;
    amount?: string;
    expiresAt: number;
    createdAt: number;
};

export class X402AccessPassStore {
    private passes = new Map<string, X402AccessPass>();

    get(id: string, nowMs = Date.now()) {
        const pass = this.passes.get(id);

        if (!pass) return undefined;

        if (pass.expiresAt <= nowMs) {
            this.passes.delete(id);
            return undefined;
        }

        return pass;
    }

    set(pass: X402AccessPass) {
        this.passes.set(pass.id, pass);
    }

    size(nowMs = Date.now()) {
        this.prune(nowMs);
        return this.passes.size;
    }

    clear() {
        this.passes.clear();
    }

    prune(nowMs = Date.now()) {
        for (const [id, pass] of this.passes.entries()) {
            if (pass.expiresAt <= nowMs) this.passes.delete(id);
        }
    }
}

export const x402AccessPassStore = new X402AccessPassStore();

export function getPaymentHeader(headers: Headers | { get(name: string): string | null | undefined }) {
    return headers.get(PAYMENT_SIGNATURE_HEADER) ?? headers.get(LEGACY_PAYMENT_HEADER) ?? undefined;
}

export function hasPaymentHeader(headers: Headers | { get(name: string): string | null | undefined }) {
    return getPaymentHeader(headers) !== undefined;
}

export function getPaymentIdentifierFromPayload(paymentPayload: PaymentPayload) {
    return extractPaymentIdentifier(paymentPayload, true) ?? undefined;
}

export function getPaymentPayloadFromHeader(paymentHeader: string) {
    try {
        return decodePaymentSignatureHeader(paymentHeader);
    } catch {
        return undefined;
    }
}

export function getPaymentIdentifierFromHeader(paymentHeader: string) {
    const paymentPayload = getPaymentPayloadFromHeader(paymentHeader);
    if (!paymentPayload) return undefined;

    return getPaymentIdentifierFromPayload(paymentPayload);
}

export function cacheSettledAccessPass(
    paymentPayload: PaymentPayload,
    settleResult: Readonly<SettleResponse>,
    durationSeconds: number,
    nowMs = Date.now()
) {
    if (!settleResult.success) return undefined;

    const id = getPaymentIdentifierFromPayload(paymentPayload);
    if (!id) return undefined;

    const pass: X402AccessPass = {
        id,
        payer: settleResult.payer,
        transaction: settleResult.transaction,
        network: settleResult.network,
        amount: settleResult.amount,
        createdAt: nowMs,
        expiresAt: nowMs + durationSeconds * 1000,
    };

    x402AccessPassStore.set(pass);
    return pass;
}
