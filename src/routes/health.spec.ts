import { describe, expect, it } from 'bun:test';
import { extractVersion } from '../extractVersion.js';

describe('extractVersion', () => {
    it('should extract version from standard database name', () => {
        expect(extractVersion('mainnet:evm-transfers@v0.2.2')).toBe('0.2.2');
    });

    it('should extract version from different modules', () => {
        expect(extractVersion('mainnet:evm-balances@v0.2.3')).toBe('0.2.3');
        expect(extractVersion('mainnet:evm-nft-tokens@v0.6.2')).toBe('0.6.2');
        expect(extractVersion('mainnet:evm-dex@v0.2.6')).toBe('0.2.6');
        expect(extractVersion('mainnet:evm-contracts@v0.3.0')).toBe('0.3.0');
    });

    it('should extract version from SVM database names', () => {
        expect(extractVersion('solana:solana-tokens@v0.2.8')).toBe('0.2.8');
        expect(extractVersion('solana:svm-dex@v0.3.1')).toBe('0.3.1');
    });

    it('should return "unknown" for database names without version', () => {
        expect(extractVersion('mainnet:evm-transfers')).toBe('unknown');
        expect(extractVersion('some-database')).toBe('unknown');
    });

    it('should return "unknown" for empty string', () => {
        expect(extractVersion('')).toBe('unknown');
    });

    it('should handle multi-digit version numbers', () => {
        expect(extractVersion('mainnet:evm-tokens@v1.17.4')).toBe('1.17.4');
    });
});
