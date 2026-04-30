import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
    apiErrorResponseSchema,
    apiUsageResponseSchema,
    blockNumberSchema,
    clientErrorResponseSchema,
    createQuerySchema,
    dateTimeSchema,
    evmAddress,
    evmAddressSchema,
    evmContractSchema,
    evmFactorySchema,
    evmIntervalSchema,
    evmNetworkIdSchema,
    evmPoolSchema,
    evmProtocolSchema,
    evmTokenResponseSchema,
    evmTransaction,
    evmTransactionSchema,
    includeNullBalancesSchema,
    intervalSchema,
    limitSchema,
    nftTokenIdSchema,
    nftTokenStandardSchema,
    pageSchema,
    paginationQuerySchema,
    paginationResponseSchema,
    polymarketConditionIdSchema,
    polymarketEventTypeSchema,
    polymarketMarketPositionSortBySchema,
    polymarketMarketSortBySchema,
    polymarketPositionSortBySchema,
    polymarketSlugSchema,
    polymarketTokenIdSchema,
    polymarketUserSortBySchema,
    serverErrorResponseSchema,
    statisticsResponseSchema,
    svmAddress,
    svmAddressSchema,
    svmAmmPoolSchema,
    svmAmmSchema,
    svmAuthoritySchema,
    svmIntervalSchema,
    svmMetadataSchema,
    svmMintResponseSchema,
    svmMintSchema,
    svmNetworkIdSchema,
    svmOwnerSchema,
    svmProgramIdSchema,
    svmProtocolSchema,
    svmSPLTokenProgramIdSchema,
    svmTokenAccountSchema,
    svmTransaction,
    svmTransactionSchema,
    timestampSchema,
    tvmAddress,
    tvmAddressSchema,
    tvmContractSchema,
    tvmFactorySchema,
    tvmNetworkIdSchema,
    tvmPoolSchema,
    tvmProtocolSchema,
    tvmTokenResponseSchema,
    tvmTransaction,
    tvmTransactionSchema,
    userLookbackIntervalSchema,
} from './zod.js';

describe('Base Validation Schemas', () => {
    describe('evmAddress', () => {
        it('should validate correct EVM addresses', () => {
            expect(evmAddress.parse('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(
                '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
            );
            expect(evmAddress.parse('d8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(
                '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
            );
        });

        it('should transform addresses to lowercase with 0x prefix', () => {
            const result = evmAddress.parse('D8DA6BF26964AF9D7EED9E03E53415D37AA96045');
            expect(result).toBe('0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
        });

        it('should reject invalid EVM addresses', () => {
            expect(() => evmAddress.parse('invalid')).toThrow();
            expect(() => evmAddress.parse('0x123')).toThrow();
            expect(() => evmAddress.parse('0xGGGG6BF26964aF9D7eEd9e03E53415D37aA96045')).toThrow();
        });
    });

    describe('evmTransaction', () => {
        it('should validate correct EVM transaction hashes', () => {
            const validTx = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
            expect(evmTransaction.parse(validTx)).toBe(validTx);
        });

        it('should add 0x prefix if missing', () => {
            const txWithout0x = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
            expect(evmTransaction.parse(txWithout0x)).toBe(`0x${txWithout0x}`);
        });

        it('should reject invalid transaction hashes', () => {
            expect(() => evmTransaction.parse('0x123')).toThrow();
            expect(() => evmTransaction.parse('invalid')).toThrow();
        });
    });

    describe('svmAddress', () => {
        it('should validate correct SVM addresses', () => {
            const validAddress = 'So11111111111111111111111111111111111111112';
            expect(svmAddress.parse(validAddress)).toBe(validAddress);
        });

        it('should reject invalid SVM addresses', () => {
            expect(() => svmAddress.parse('invalid')).toThrow();
            expect(() => svmAddress.parse('0x1234567890abcdef')).toThrow();
            expect(() => svmAddress.parse('123')).toThrow();
        });
    });

    describe('svmTransaction', () => {
        it('should validate correct SVM transaction signatures', () => {
            const validSig = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
            expect(svmTransaction.parse(validSig)).toBe(validSig);
        });

        it('should reject invalid SVM transaction signatures', () => {
            expect(() => svmTransaction.parse('invalid')).toThrow();
            expect(() => svmTransaction.parse('short')).toThrow();
        });
    });

    describe('tvmAddress', () => {
        it('should validate correct TVM addresses', () => {
            expect(tvmAddress.parse('TRX9Uehj3GuFVh5jjVjNqb6q9cgVHJ4jGX')).toBe('TRX9Uehj3GuFVh5jjVjNqb6q9cgVHJ4jGX');
            expect(tvmAddress.parse('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
        });

        it('should reject invalid TVM addresses', () => {
            expect(() => tvmAddress.parse('invalid')).toThrow();
            expect(() => tvmAddress.parse('0x1234567890abcdef')).toThrow();
            expect(() => tvmAddress.parse('T123')).toThrow(); // Too short
            expect(() => tvmAddress.parse('ARYX9Uehj3GuFVh5jjVjNqb6q9cgVHJ4jGX')).toThrow(); // Doesn't start with T
            expect(() => tvmAddress.parse('TRX9Uehj3GuFVh5jjVjNqb6q9cgVHJ4jG0')).toThrow(); // Contains invalid char '0'
        });
    });

    describe('tvmTransaction', () => {
        it('should validate correct TVM transaction hashes', () => {
            const validTx = 'a7c8e5f9b2d4c6e8a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7';
            expect(tvmTransaction.parse(validTx)).toBe(validTx);
        });

        it('should transform to lowercase', () => {
            const txUpper = 'A7C8E5F9B2D4C6E8A1B3C5D7E9F1A3B5C7D9E1F3A5B7C9D1E3F5A7B9C1D3E5F7';
            expect(tvmTransaction.parse(txUpper)).toBe(txUpper.toLowerCase());
        });

        it('should reject transaction hashes with 0x prefix', () => {
            expect(() =>
                tvmTransaction.parse('0xa7c8e5f9b2d4c6e8a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7')
            ).toThrow();
        });

        it('should reject invalid transaction hashes', () => {
            expect(() => tvmTransaction.parse('invalid')).toThrow();
            expect(() => tvmTransaction.parse('a7c8e5f9')).toThrow(); // Too short
            expect(() =>
                tvmTransaction.parse('g7c8e5f9b2d4c6e8a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7')
            ).toThrow(); // Invalid char 'g'
        });
    });

    describe('dateTimeSchema', () => {
        it('should accept ISO 8601 with Z timezone', () => {
            expect(dateTimeSchema.parse('2025-11-07T07:13:23Z')).toBe('2025-11-07T07:13:23Z');
        });

        it('should accept ISO 8601 without timezone', () => {
            expect(dateTimeSchema.parse('2025-11-07T07:13:23')).toBe('2025-11-07T07:13:23');
        });

        it('should accept ISO 8601 with offset timezone', () => {
            expect(dateTimeSchema.parse('2025-11-07T07:13:23+00:00')).toBe('2025-11-07T07:13:23+00:00');
            expect(dateTimeSchema.parse('2025-11-07T07:13:23-05:00')).toBe('2025-11-07T07:13:23-05:00');
        });

        it('should accept SQL datetime format with space separator', () => {
            expect(dateTimeSchema.parse('2025-11-07 07:13:23')).toBe('2025-11-07 07:13:23');
            expect(dateTimeSchema.parse('2025-10-04 23:05:35')).toBe('2025-10-04 23:05:35');
        });

        it('should accept fractional seconds with T separator', () => {
            expect(dateTimeSchema.parse('2025-11-07T07:13:23.456Z')).toBe('2025-11-07T07:13:23.456Z');
            expect(dateTimeSchema.parse('2025-11-07T07:13:23.123456')).toBe('2025-11-07T07:13:23.123456');
        });

        it('should accept fractional seconds with space separator', () => {
            expect(dateTimeSchema.parse('2025-11-07 07:13:23.456')).toBe('2025-11-07 07:13:23.456');
            expect(dateTimeSchema.parse('2025-11-07 07:13:23.123456')).toBe('2025-11-07 07:13:23.123456');
        });

        it('should accept SQL format with timezone', () => {
            expect(dateTimeSchema.parse('2025-11-07 07:13:23Z')).toBe('2025-11-07 07:13:23Z');
            expect(dateTimeSchema.parse('2025-11-07 07:13:23+00:00')).toBe('2025-11-07 07:13:23+00:00');
        });

        it('should reject invalid datetime formats', () => {
            expect(() => dateTimeSchema.parse('invalid')).toThrow('Invalid datetime format');
            expect(() => dateTimeSchema.parse('2025-11-07')).toThrow('Invalid datetime format');
            expect(() => dateTimeSchema.parse('07:13:23')).toThrow('Invalid datetime format');
        });

        it('should reject dates with invalid separators', () => {
            expect(() => dateTimeSchema.parse('2025/11/07T07:13:23Z')).toThrow('Invalid datetime format');
            expect(() => dateTimeSchema.parse('2025-11-07X07:13:23Z')).toThrow('Invalid datetime format');
        });
    });
});

describe('OpenAPI metadata projection', () => {
    const cases: Array<[string, z.ZodType, string, string]> = [
        ['evmAddress', evmAddress, 'evm-address', '^(0[xX])?[0-9a-fA-F]{40}$'],
        ['evmTransaction', evmTransaction, 'evm-tx-hash', '^(0[xX])?[0-9a-fA-F]{64}$'],
        ['svmAddress', svmAddress, 'svm-address', '^[1-9A-HJ-NP-Za-km-z]{32,44}$'],
        ['svmTransaction', svmTransaction, 'svm-signature', '^[1-9A-HJ-NP-Za-km-z]{87,88}$'],
        ['tvmAddress', tvmAddress, 'tvm-address', '^T[1-9A-HJ-NP-Za-km-z]{33}$'],
        ['tvmTransaction', tvmTransaction, 'tvm-tx-hash', '^[0-9a-fA-F]{64}$'],
    ];

    for (const [name, schema, expectedFormat, expectedPattern] of cases) {
        it(`${name} projects format and pattern into JSON Schema`, () => {
            const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
            expect(json.type).toBe('string');
            expect(json.format).toBe(expectedFormat);
            expect(json.pattern).toBe(expectedPattern);
        });
    }

    it('wrapper schemas inherit the base format', () => {
        const contract = z.toJSONSchema(evmContractSchema, { io: 'input' }) as Record<string, unknown>;
        expect(contract.format).toBe('evm-address');
        const mint = z.toJSONSchema(svmMintSchema, { io: 'input' }) as Record<string, unknown>;
        expect(mint.format).toBe('svm-address');
        const tvmContract = z.toJSONSchema(tvmContractSchema, { io: 'input' }) as Record<string, unknown>;
        expect(tvmContract.format).toBe('tvm-address');
    });
});

describe('Network Schemas', () => {
    describe('evmNetworkIdSchema', () => {
        it('should accept valid EVM network IDs', () => {
            const result = evmNetworkIdSchema.parse('mainnet');
            expect(result).toBeDefined();
        });
    });

    describe('svmNetworkIdSchema', () => {
        it('should accept valid SVM network IDs', () => {
            const result = svmNetworkIdSchema.parse('solana');
            expect(result).toBeDefined();
        });
    });

    describe('tvmNetworkIdSchema', () => {
        it('should accept valid TVM network IDs', () => {
            const result = tvmNetworkIdSchema.parse('tron');
            expect(result).toBeDefined();
        });
    });
});

describe('Protocol Schemas', () => {
    describe('evmProtocolSchema', () => {
        it('should accept valid protocols', () => {
            expect(evmProtocolSchema.parse('uniswap_v2')).toBe('uniswap_v2');
            expect(evmProtocolSchema.parse('uniswap_v3')).toBe('uniswap_v3');
            expect(evmProtocolSchema.parse('uniswap_v4')).toBe('uniswap_v4');
            expect(evmProtocolSchema.parse('curvefi')).toBe('curvefi');
            expect(evmProtocolSchema.parse('balancer')).toBe('balancer');
            expect(evmProtocolSchema.parse('bancor')).toBe('bancor');
            expect(evmProtocolSchema.parse('cow')).toBe('cow');
            expect(evmProtocolSchema.parse('aerodrome')).toBe('aerodrome');
            expect(evmProtocolSchema.parse('dodo')).toBe('dodo');
            expect(evmProtocolSchema.parse('woofi')).toBe('woofi');
            expect(evmProtocolSchema.parse('traderjoe')).toBe('traderjoe');
            expect(evmProtocolSchema.parse('kyber_elastic')).toBe('kyber_elastic');
        });

        it('should reject invalid protocols', () => {
            expect(() => evmProtocolSchema.parse('invalid')).toThrow();
        });
    });

    describe('svmProtocolSchema', () => {
        it('should accept valid protocols', () => {
            const protocols = [
                'boop',
                'darklake',
                'dumpfun',
                'jupiter_v4',
                'jupiter_v6',
                'meteora_daam',
                'meteora_dlmm',
                'orca_whirlpool',
                'pumpfun',
                'pumpfun_amm',
                'raydium_amm_v4',
                'raydium_clmm',
                'raydium_cpmm',
                'raydium_launchpad',
                'meteora_amm',
                'byreal',
                'moonshot',
                'pancakeswap',
            ] as const;

            for (const protocol of protocols) {
                expect(svmProtocolSchema.parse(protocol)).toBe(protocol);
            }
        });

        it('should reject invalid protocols', () => {
            expect(() => svmProtocolSchema.parse('invalid')).toThrow();
        });
    });

    describe('tvmProtocolSchema', () => {
        it('should accept valid protocols', () => {
            expect(tvmProtocolSchema.parse('uniswap_v2')).toBe('uniswap_v2');
            expect(tvmProtocolSchema.parse('uniswap_v1')).toBe('uniswap_v1');
            expect(tvmProtocolSchema.parse('sunpump')).toBe('sunpump');
        });

        it('should reject invalid protocols', () => {
            expect(() => tvmProtocolSchema.parse('invalid')).toThrow();
        });
    });
});

describe('Common Query Parameter Schemas', () => {
    describe('limitSchema', () => {
        it('should parse valid limits', () => {
            expect(limitSchema.parse(10)).toBe(10);
            expect(limitSchema.parse('25')).toBe(25);
        });

        it('should use default value', () => {
            const result = limitSchema.parse(undefined);
            expect(result).toBeGreaterThan(0);
        });

        it('should reject invalid limits', () => {
            expect(() => limitSchema.parse(0)).toThrow();
            expect(() => limitSchema.parse(-1)).toThrow();
            expect(() => limitSchema.parse(10000000)).toThrow();
        });
    });

    describe('pageSchema', () => {
        it('should parse valid page numbers', () => {
            expect(pageSchema.parse(1)).toBe(1);
            expect(pageSchema.parse('5')).toBe(5);
        });

        it('should use default value', () => {
            expect(pageSchema.parse(undefined)).toBe(1);
        });

        it('should reject invalid page numbers', () => {
            expect(() => pageSchema.parse(0)).toThrow();
            expect(() => pageSchema.parse(-1)).toThrow();
        });
    });

    describe('intervalSchema', () => {
        it('should transform intervals to minutes', () => {
            expect(intervalSchema.parse('1h')).toBe(60);
            expect(intervalSchema.parse('4h')).toBe(240);
            expect(intervalSchema.parse('1d')).toBe(1440);
            expect(intervalSchema.parse('1w')).toBe(10080);
        });

        it('should reject invalid intervals', () => {
            expect(() => intervalSchema.parse('invalid')).toThrow();
        });

        it('should reject minute intervals on SVM schema', () => {
            expect(() => intervalSchema.parse('1m')).toThrow();
            expect(() => intervalSchema.parse('5m')).toThrow();
            expect(() => intervalSchema.parse('10m')).toThrow();
            expect(() => intervalSchema.parse('30m')).toThrow();
        });
    });

    describe('evmIntervalSchema', () => {
        it('should transform all EVM intervals to minutes', () => {
            expect(evmIntervalSchema.parse('1m')).toBe(1);
            expect(evmIntervalSchema.parse('5m')).toBe(5);
            expect(evmIntervalSchema.parse('10m')).toBe(10);
            expect(evmIntervalSchema.parse('30m')).toBe(30);
            expect(evmIntervalSchema.parse('1h')).toBe(60);
            expect(evmIntervalSchema.parse('4h')).toBe(240);
            expect(evmIntervalSchema.parse('1d')).toBe(1440);
            expect(evmIntervalSchema.parse('1w')).toBe(10080);
        });

        it('should reject invalid intervals', () => {
            expect(() => evmIntervalSchema.parse('invalid')).toThrow();
        });
    });

    describe('svmIntervalSchema', () => {
        it('should parse valid SVM intervals', () => {
            expect(svmIntervalSchema.parse('1h')).toBe(60);
            expect(svmIntervalSchema.parse('4h')).toBe(240);
            expect(svmIntervalSchema.parse('1d')).toBe(1440);
            expect(svmIntervalSchema.parse('1w')).toBe(10080);
        });

        it('should reject invalid intervals', () => {
            expect(() => svmIntervalSchema.parse('invalid')).toThrow();
        });

        it('should reject EVM-only intervals', () => {
            expect(() => svmIntervalSchema.parse('1m')).toThrow();
            expect(() => svmIntervalSchema.parse('5m')).toThrow();
        });
    });

    describe('timestampSchema', () => {
        it('should parse UNIX timestamps as strings', () => {
            expect(timestampSchema.parse('1735689600')).toBe(1735689600);
        });

        it('should parse date strings', () => {
            const result = timestampSchema.parse('2025-01-01T00:00:00Z');
            expect(result).toBe(1735689600);
        });

        it('should parse various date formats', () => {
            const isoResult = timestampSchema.parse('2025-01-01');
            expect(isoResult).toBeGreaterThan(0);
        });

        it('should reject negative timestamps', () => {
            expect(() => timestampSchema.parse('-1')).toThrow();
        });

        it('should reject timestamps exceeding MAX_SAFE_INTEGER', () => {
            expect(() => timestampSchema.parse('9007199254740992')).toThrow();
        });

        it('should reject invalid date strings', () => {
            expect(() => timestampSchema.parse('invalid date')).toThrow('Invalid date string');
        });

        it('should reject empty strings', () => {
            expect(() => timestampSchema.parse('')).toThrow('Invalid date string');
        });

        it('should handle numeric strings with whitespace', () => {
            expect(timestampSchema.parse('  1735689600  ')).toBe(1735689600);
        });

        it('should reject date strings that result in negative timestamps', () => {
            expect(() => timestampSchema.parse('1800-01-01T00:00:00Z')).toThrow();
        });

        it('should reject numeric timestamps that produce invalid dates', () => {
            expect(() => timestampSchema.parse('Infinity')).toThrow();
        });
    });

    describe('blockNumberSchema', () => {
        it('should parse valid block numbers', () => {
            expect(blockNumberSchema.parse(12345)).toBe(12345);
            expect(blockNumberSchema.parse('67890')).toBe(67890);
        });

        it('should reject negative block numbers', () => {
            expect(() => blockNumberSchema.parse(-1)).toThrow();
        });
    });

    describe('includeNullBalancesSchema', () => {
        it('should accept valid boolean strings', () => {
            expect(includeNullBalancesSchema.parse('true')).toBe(true);
            expect(includeNullBalancesSchema.parse('false')).toBe(false);
        });

        it('should accept valid boolean values', () => {
            expect(includeNullBalancesSchema.parse(true)).toBe(true);
            expect(includeNullBalancesSchema.parse(false)).toBe(false);
        });

        it('should reject invalid values', () => {
            expect(() => includeNullBalancesSchema.parse('yes')).toThrow();
            expect(() => includeNullBalancesSchema.parse('1')).toThrow();
        });
    });
});

describe('NFT Schemas', () => {
    describe('nftTokenIdSchema', () => {
        it('should parse valid token IDs', () => {
            expect(nftTokenIdSchema.parse('5712')).toBe('5712');
            expect(nftTokenIdSchema.parse(12345)).toBe('12345');
        });

        it('should accept empty string', () => {
            expect(nftTokenIdSchema.parse('')).toBe('');
        });

        it('should reject invalid token IDs', () => {
            expect(() => nftTokenIdSchema.parse('abc')).toThrow();
        });
    });

    describe('nftTokenStandardSchema', () => {
        it('should accept valid token standards', () => {
            expect(nftTokenStandardSchema.parse('ERC721')).toBe('ERC721');
            expect(nftTokenStandardSchema.parse('ERC1155')).toBe('ERC1155');
        });

        it('should reject invalid standards', () => {
            expect(() => nftTokenStandardSchema.parse('ERC20')).toThrow();
        });
    });
});

describe('Composable Field Schemas', () => {
    describe('EVM schemas', () => {
        it('evmContractSchema should validate contracts', () => {
            const result = evmContractSchema.parse('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
            expect(result).toBe('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
        });

        it('evmAddressSchema should validate addresses', () => {
            const result = evmAddressSchema.parse('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
            expect(result).toBe('0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
        });

        it('evmPoolSchema should accept both addresses and transactions', () => {
            const address = evmPoolSchema.parse('0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640');
            expect(address).toBe('0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640');
        });

        it('evmFactorySchema should validate factory addresses', () => {
            const result = evmFactorySchema.parse('0x1F98431c8aD98523631AE4a59f267346ea31F984');
            expect(result).toBe('0x1f98431c8ad98523631ae4a59f267346ea31f984');
        });

        it('evmTransactionSchema should validate transaction hashes', () => {
            const tx = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
            expect(evmTransactionSchema.parse(tx)).toBe(tx);
        });
    });

    describe('SVM schemas', () => {
        it('svmAddressSchema should validate addresses', () => {
            const address = 'So11111111111111111111111111111111111111112';
            expect(svmAddressSchema.parse(address)).toBe(address);
        });

        it('svmOwnerSchema should validate owner addresses', () => {
            const owner = 'So11111111111111111111111111111111111111112';
            expect(svmOwnerSchema.parse(owner)).toBe(owner);
        });

        it('svmTokenAccountSchema should validate token accounts', () => {
            const account = '4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A';
            expect(svmTokenAccountSchema.parse(account)).toBe(account);
        });

        it('svmMintSchema should validate mint addresses', () => {
            const mint = 'So11111111111111111111111111111111111111112';
            expect(svmMintSchema.parse(mint)).toBe(mint);
        });

        it('svmAuthoritySchema should validate authority addresses', () => {
            const authority = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';
            expect(svmAuthoritySchema.parse(authority)).toBe(authority);
        });

        it('svmAmmSchema should validate AMM addresses', () => {
            const amm = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
            expect(svmAmmSchema.parse(amm)).toBe(amm);
        });

        it('svmAmmPoolSchema should validate AMM pool addresses', () => {
            const pool = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
            expect(svmAmmPoolSchema.parse(pool)).toBe(pool);
        });

        it('svmTransactionSchema should validate transaction signatures', () => {
            const sig = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
            expect(svmTransactionSchema.parse(sig)).toBe(sig);
        });

        it('svmProgramIdSchema should accept valid program IDs', () => {
            const programId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
            expect(svmProgramIdSchema.parse(programId)).toBe(programId);
        });

        it('svmSPLTokenProgramIdSchema should accept valid SPL program IDs', () => {
            const programId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
            expect(svmSPLTokenProgramIdSchema.parse(programId)).toBe(programId);
        });

        it('svmMetadataSchema should accept string, null, or undefined', () => {
            expect(svmMetadataSchema.parse('metadata')).toBe('metadata');
            expect(svmMetadataSchema.parse(null)).toBe(null);
            const result = svmMetadataSchema.parse(undefined);
            expect(result).toBeUndefined();
        });
    });

    describe('TVM schemas', () => {
        it('tvmContractSchema should validate contracts', () => {
            const result = tvmContractSchema.parse('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
            expect(result).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
        });

        it('tvmAddressSchema should validate addresses', () => {
            const result = tvmAddressSchema.parse('TRX9Uehj3GuFVh5jjVjNqb6q9cgVHJ4jGX');
            expect(result).toBe('TRX9Uehj3GuFVh5jjVjNqb6q9cgVHJ4jGX');
        });

        it('tvmPoolSchema should validate pool addresses', () => {
            const pool = tvmPoolSchema.parse('TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE');
            expect(pool).toBe('TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE');
        });

        it('tvmFactorySchema should validate factory addresses', () => {
            const result = tvmFactorySchema.parse('TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax');
            expect(result).toBe('TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax');
        });

        it('tvmTransactionSchema should validate transaction hashes', () => {
            const tx = 'a7c8e5f9b2d4c6e8a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7';
            expect(tvmTransactionSchema.parse(tx)).toBe(tx);
        });
    });
});

describe('Response Schemas', () => {
    describe('evmTokenResponseSchema', () => {
        it('should validate token response objects', () => {
            const token = {
                address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                symbol: 'WETH',
                decimals: 18,
            };
            const result = evmTokenResponseSchema.parse(token);
            expect(result.symbol).toBe('WETH');
            expect(result.decimals).toBe(18);
        });
    });

    describe('svmMintResponseSchema', () => {
        it('should validate mint response objects', () => {
            const mint = {
                address: 'So11111111111111111111111111111111111111112',
                symbol: 'WSOL',
                name: 'Wrapped SOL',
                decimals: 9,
            };
            const result = svmMintResponseSchema.parse(mint);
            expect(result.decimals).toBe(9);
        });
    });

    describe('tvmTokenResponseSchema', () => {
        it('should validate token response objects', () => {
            const token = {
                address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                symbol: 'USDT',
                name: 'Tether USD',
                decimals: 6,
            };
            const result = tvmTokenResponseSchema.parse(token);
            expect(result.address).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
            expect(result.symbol).toBe('USDT');
            expect(result.name).toBe('Tether USD');
            expect(result.decimals).toBe(6);
        });
    });

    describe('paginationQuerySchema', () => {
        it('should parse pagination parameters', () => {
            const result = paginationQuerySchema.parse({ limit: 10, page: 2 });
            expect(result.limit).toBe(10);
            expect(result.page).toBe(2);
        });

        it('should use defaults when not provided', () => {
            const result = paginationQuerySchema.parse({});
            expect(result.limit).toBeGreaterThan(0);
            expect(result.page).toBe(1);
        });
    });

    describe('statisticsResponseSchema', () => {
        it('should validate statistics objects', () => {
            const stats = {
                elapsed: 0.188,
                rows_read: 1090000,
                bytes_read: 88280000,
            };
            const result = statisticsResponseSchema.parse(stats);
            expect(result.elapsed).toBe(0.188);
        });
    });

    describe('paginationResponseSchema', () => {
        it('should validate pagination response objects', () => {
            const pagination = {
                previous_page: 1,
                current_page: 2,
            };
            const result = paginationResponseSchema.parse(pagination);
            expect(result.current_page).toBe(2);
        });
    });

    describe('apiUsageResponseSchema', () => {
        it('should validate complete API response objects', () => {
            const response = {
                data: [{ id: 1 }],
                statistics: { rows_read: 1, bytes_read: 1, elapsed: 0.1 },
                pagination: { previous_page: 1, current_page: 1 },
                results: 1,
                request_time: new Date().toISOString(),
                duration_ms: 100,
            };
            const result = apiUsageResponseSchema.parse(response);
            expect(result.results).toBe(1);
            expect(result.duration_ms).toBe(100);
        });
    });
});

describe('Error Response Schemas', () => {
    describe('clientErrorResponseSchema', () => {
        it('should validate client error responses', () => {
            const error = {
                status: 400,
                code: 'bad_query_input',
                message: 'Invalid input',
            };
            const result = clientErrorResponseSchema.parse(error);
            expect(result.status).toBe(400);
            expect(result.code).toBe('bad_query_input');
        });

        it('should accept all client error codes', () => {
            const codes = ['authentication_failed', 'bad_header', 'forbidden', 'not_found_data'];
            for (const code of codes) {
                const error = { status: 400, code, message: 'Error' };
                expect(() => clientErrorResponseSchema.parse(error)).not.toThrow();
            }
        });
    });

    describe('serverErrorResponseSchema', () => {
        it('should validate server error responses', () => {
            const error = {
                status: 500,
                code: 'internal_server_error',
                message: 'Server error',
            };
            const result = serverErrorResponseSchema.parse(error);
            expect(result.status).toBe(500);
        });
    });

    describe('apiErrorResponseSchema', () => {
        it('should accept both client and server errors', () => {
            const clientError = { status: 400, code: 'bad_query_input', message: 'Error' };
            const serverError = { status: 500, code: 'internal_server_error', message: 'Error' };

            expect(() => apiErrorResponseSchema.parse(clientError)).not.toThrow();
            expect(() => apiErrorResponseSchema.parse(serverError)).not.toThrow();
        });
    });
});

describe('createQuerySchema', () => {
    describe('basic functionality', () => {
        it('should create a query schema with required fields', () => {
            const schema = createQuerySchema(
                {
                    network: { schema: svmNetworkIdSchema },
                },
                false
            );

            const result = schema.parse({ network: 'solana' });
            expect(result.network).toBe('solana');
        });

        it('should reject missing required fields', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema },
                },
                false
            );

            expect(() => schema.parse({})).toThrow('owner is required');
        });

        it('should allow optional fields with defaults', () => {
            const schema = createQuerySchema(
                {
                    include_null_balances: { schema: includeNullBalancesSchema, default: false },
                },
                false
            );

            const result = schema.parse({});
            expect(result.include_null_balances).toBe(false);
        });
    });

    describe('batched fields', () => {
        it('should accept single values for batched fields', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema, batched: true },
                },
                false
            );

            const result = schema.parse({ owner: 'So11111111111111111111111111111111111111112' });
            expect(Array.isArray(result.owner)).toBe(true);
            expect(result.owner[0]).toBe('So11111111111111111111111111111111111111112');
        });

        it('should accept comma-separated values for batched fields', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema, batched: true },
                },
                false
            );

            const result = schema.parse({
                owner: 'So11111111111111111111111111111111111111112,4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A',
            });
            expect(result.owner).toHaveLength(2);
        });

        it('should accept arrays for batched fields', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema, batched: true },
                },
                false
            );

            const result = schema.parse({
                owner: ['So11111111111111111111111111111111111111112', '4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A'],
            });
            expect(result.owner).toHaveLength(2);
        });

        it('should validate each item in batched fields', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema, batched: true },
                },
                false
            );

            expect(() => schema.parse({ owner: 'invalid,So11111111111111111111111111111111111111112' })).toThrow();
        });
    });

    describe('pagination', () => {
        it('should include pagination when include_pagination is true', () => {
            const schema = createQuerySchema({
                network: { schema: svmNetworkIdSchema },
            });

            const result = schema.parse({ network: 'solana', limit: 25, page: 2 });
            expect(result.limit).toBe(25);
            expect(result.page).toBe(2);
        });

        it('should not include pagination when include_pagination is false', () => {
            const schema = createQuerySchema(
                {
                    network: { schema: svmNetworkIdSchema },
                },
                false
            );

            const result = schema.parse({ network: 'solana' });
            expect('limit' in result).toBe(false);
            expect('page' in result).toBe(false);
        });
    });

    describe('complex query schema', () => {
        it('should handle mixed required and optional fields', () => {
            const schema = createQuerySchema({
                network: { schema: svmNetworkIdSchema },
                owner: { schema: svmOwnerSchema, batched: true },
                token_account: { schema: svmTokenAccountSchema, batched: true, default: '' },
                include_null_balances: { schema: includeNullBalancesSchema, default: false },
            });

            const result = schema.parse({
                network: 'solana',
                owner: 'So11111111111111111111111111111111111111112',
            });

            expect(result.network).toBe('solana');
            expect(Array.isArray(result.owner)).toBe(true);
            expect(result.token_account).toEqual(['']);
            expect(result.include_null_balances).toBe(false);
        });
    });

    describe('custom separators', () => {
        it('should support custom separators for batched fields', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema, batched: true, separator: '|' },
                },
                false
            );

            const result = schema.parse({
                owner: 'So11111111111111111111111111111111111111112|4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A',
            });
            expect(result.owner).toHaveLength(2);
        });
    });

    describe('error messages', () => {
        it('should provide clear error messages for missing required fields', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema, batched: true },
                    mint: { schema: svmMintSchema, batched: true },
                },
                false
            );

            try {
                schema.parse({ mint: 'So11111111111111111111111111111111111111112' });
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                if (error instanceof z.ZodError) {
                    expect(error.issues?.[0]?.message).toContain('owner is required');
                }
            }
        });

        it('should provide validation errors for invalid values', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema },
                },
                false
            );

            expect(() => schema.parse({ owner: 'invalid' })).toThrow('Invalid SVM address');
        });

        it('should reject array values for non-batched required fields', () => {
            const schema = createQuerySchema(
                {
                    network: { schema: svmNetworkIdSchema },
                },
                false
            );

            expect(() => schema.parse({ network: ['solana', 'solana'] })).toThrow('multiple values are not supported');
        });
    });

    describe('description length validation', () => {
        it('should accept description with exactly 299 characters', () => {
            const definitions = {
                field: {
                    schema: z.string().meta({ description: 'a'.repeat(299) }),
                },
            };

            expect(() => createQuerySchema(definitions)).not.toThrow();
        });

        it('should reject description with exactly 300 characters', () => {
            const definitions = {
                field: {
                    schema: z.string().meta({ description: 'a'.repeat(300) }),
                },
            };

            expect(() => createQuerySchema(definitions)).toThrow(
                "'field' description field has more than 300 characters."
            );
        });

        it('should reject description with more than 300 characters', () => {
            const definitions = {
                field: {
                    schema: z.string().meta({ description: 'a'.repeat(500) }),
                },
            };

            expect(() => createQuerySchema(definitions)).toThrow(
                "'field' description field has more than 300 characters."
            );
        });

        it('should accept field with no description', () => {
            const definitions = {
                field: {
                    schema: z.string(),
                },
            };

            expect(() => createQuerySchema(definitions)).not.toThrow();
        });

        it('should accept description with empty string', () => {
            const definitions = {
                field: {
                    schema: z.string().meta({ description: '' }),
                },
            };

            expect(() => createQuerySchema(definitions)).not.toThrow();
        });

        it('should reject long description in batched field', () => {
            const definitions = {
                field: {
                    schema: z.string().meta({ description: 'a'.repeat(300) }),
                    batched: true,
                    separator: ',',
                },
            };

            expect(() => createQuerySchema(definitions)).toThrow(
                "'field' description field has more than 300 characters."
            );
        });
    });

    describe('optional batched fields', () => {
        it('should default to empty array when optional batched field is omitted', () => {
            const schema = createQuerySchema(
                {
                    network: { schema: svmNetworkIdSchema },
                    mint: { schema: svmMintSchema, batched: true, optional: true },
                },
                false
            );

            const result = schema.parse({ network: 'solana' });
            expect(result.mint).toEqual([]);
        });

        it('should default to null when optional scalar field is omitted', () => {
            const schema = createQuerySchema(
                {
                    network: { schema: svmNetworkIdSchema },
                    start_time: { schema: timestampSchema, optional: true },
                },
                false
            );

            const result = schema.parse({ network: 'solana' });
            expect(result.start_time).toBeNull();
        });

        it('should not expose default:null in OpenAPI meta for optional scalar fields', () => {
            const schema = createQuerySchema(
                {
                    start_block: { schema: blockNumberSchema, optional: true },
                },
                false
            );

            const meta = schema.shape.start_block.meta();
            expect(meta?.default).toBeUndefined();
        });

        it('should preserve default in OpenAPI meta for optional batched fields', () => {
            const schema = createQuerySchema(
                {
                    mint: { schema: svmMintSchema, batched: true, optional: true },
                },
                false
            );

            const meta = schema.shape.mint.meta();
            expect(meta?.default).not.toBeNull();
        });
    });

    describe('prefault fields', () => {
        it('should use prefault value when field is omitted', () => {
            const schema = createQuerySchema(
                {
                    network: { schema: svmNetworkIdSchema, prefault: 'solana' },
                },
                false
            );

            const result = schema.parse({});
            expect(result.network).toBe('solana');
        });

        it('should parse the prefault value through the schema', () => {
            const schema = createQuerySchema(
                {
                    owner: { schema: svmOwnerSchema, prefault: 'So11111111111111111111111111111111111111112' },
                },
                false
            );

            const result = schema.parse({});
            expect(result.owner).toBe('So11111111111111111111111111111111111111112');
        });

        it('should allow overriding the prefault value', () => {
            const schema = createQuerySchema(
                {
                    network: { schema: svmNetworkIdSchema, prefault: 'solana' },
                },
                false
            );

            const result = schema.parse({ network: 'solana' });
            expect(result.network).toBe('solana');
        });
    });
});

describe('Polymarket schemas', () => {
    describe('polymarketConditionIdSchema', () => {
        it('should accept valid condition ID', () => {
            expect(
                polymarketConditionIdSchema.parse('0x9708334534b504e2025a5a6af92f8600808c10be577e5066f920c40625fbec16')
            ).toBe('0x9708334534b504e2025a5a6af92f8600808c10be577e5066f920c40625fbec16');
        });

        it('should lowercase uppercase hex', () => {
            expect(
                polymarketConditionIdSchema.parse('0x9708334534B504E2025A5A6AF92F8600808C10BE577E5066F920C40625FBEC16')
            ).toBe('0x9708334534b504e2025a5a6af92f8600808c10be577e5066f920c40625fbec16');
        });

        it('should reject short hex', () => {
            expect(() => polymarketConditionIdSchema.parse('0x9708')).toThrow();
        });

        it('should reject without 0x prefix', () => {
            expect(() =>
                polymarketConditionIdSchema.parse('9708334534b504e2025a5a6af92f8600808c10be577e5066f920c40625fbec16')
            ).toThrow();
        });
    });

    describe('polymarketTokenIdSchema', () => {
        it('should accept numeric string', () => {
            expect(
                polymarketTokenIdSchema.parse(
                    '53342136288932702007624506186417846874594504126387502748453102780630218207922'
                )
            ).toBe('53342136288932702007624506186417846874594504126387502748453102780630218207922');
        });

        it('should reject hex string', () => {
            expect(() => polymarketTokenIdSchema.parse('0xabc123')).toThrow();
        });

        it('should reject empty string', () => {
            expect(() => polymarketTokenIdSchema.parse('')).toThrow();
        });
    });

    describe('polymarketSlugSchema', () => {
        it('should accept valid slug', () => {
            expect(polymarketSlugSchema.parse('will-bitcoin-reach-150k-in-january-2026')).toBe(
                'will-bitcoin-reach-150k-in-january-2026'
            );
        });

        it('should reject slug starting with hyphen', () => {
            expect(() => polymarketSlugSchema.parse('-invalid-slug')).toThrow();
        });

        it('should reject uppercase', () => {
            expect(() => polymarketSlugSchema.parse('Invalid-Slug')).toThrow();
        });
    });

    describe('polymarketEventTypeSchema', () => {
        it('should accept all valid types', () => {
            expect(polymarketEventTypeSchema.parse('trade')).toBe('trade');
            expect(polymarketEventTypeSchema.parse('split')).toBe('split');
            expect(polymarketEventTypeSchema.parse('merge')).toBe('merge');
            expect(polymarketEventTypeSchema.parse('redeem')).toBe('redeem');
        });

        it('should reject invalid type', () => {
            expect(() => polymarketEventTypeSchema.parse('swap')).toThrow();
        });
    });

    describe('polymarketSortBySchemas', () => {
        it('market sort should accept volume, end_date, start_date', () => {
            expect(polymarketMarketSortBySchema.parse('volume')).toBe('volume');
            expect(polymarketMarketSortBySchema.parse('end_date')).toBe('end_date');
            expect(polymarketMarketSortBySchema.parse('start_date')).toBe('start_date');
        });

        it('market position sort should not include current_price', () => {
            expect(() => polymarketMarketPositionSortBySchema.parse('current_price')).toThrow();
        });

        it('user position sort should include current_price', () => {
            expect(polymarketPositionSortBySchema.parse('current_price')).toBe('current_price');
        });

        it('user sort should accept total_volume, realized_pnl, unrealized_pnl, total_pnl, transactions', () => {
            expect(polymarketUserSortBySchema.parse('total_volume')).toBe('total_volume');
            expect(polymarketUserSortBySchema.parse('realized_pnl')).toBe('realized_pnl');
            expect(polymarketUserSortBySchema.parse('unrealized_pnl')).toBe('unrealized_pnl');
            expect(polymarketUserSortBySchema.parse('total_pnl')).toBe('total_pnl');
            expect(polymarketUserSortBySchema.parse('transactions')).toBe('transactions');
        });

        it('user sort should reject invalid values', () => {
            expect(() => polymarketUserSortBySchema.parse('volume')).toThrow();
            expect(() => polymarketUserSortBySchema.parse('pnl')).toThrow();
        });

        it('user interval should transform to minutes', () => {
            expect(userLookbackIntervalSchema.parse('1h')).toBe(60);
            expect(userLookbackIntervalSchema.parse('1d')).toBe(1440);
            expect(userLookbackIntervalSchema.parse('1w')).toBe(10080);
            expect(userLookbackIntervalSchema.parse('30d')).toBe(43200);
        });

        it('user interval should reject invalid values', () => {
            expect(() => userLookbackIntervalSchema.parse('4h')).toThrow();
            expect(() => userLookbackIntervalSchema.parse('ALL')).toThrow();
        });
    });
});
