import { z } from 'zod';

// Per-row outcome metadata embedded on every /outcomes/* response except
// /outcomes itself (which carries the canonical full shape — description,
// side_specs, named_outcome_ids, etc.).
//
// Two variants:
//   - OutcomeContext        — aggregates that collapse legs (e.g. /outcomes/users)
//   - OutcomeLegContext     — per-leg rows (e.g. /outcomes/ohlc, /outcomes/trades,
//                             /outcomes/users/positions, /outcomes/users/activity)
//
// `settle_fraction` follows HIP-4 verbatim: a value in [0, 1] representing the
// payout per Yes share at settlement; the No share pays (1 - settle_fraction).
// Binary outcomes resolve to 0 or 1. Bounded-options-style markets can carry
// fractional values (per HIP-4 "settle within a fixed range"). Nullable until
// status='settled'.

export const outcomeContextSchema = z.object({
    outcome_id: z.number().int(),
    outcome_name: z
        .string()
        .describe(
            'Outcome leaf label. For multi-outcome questions this is the per-leg name (team, candidate, bucket). For binary single-outcome markets it is the full market title.'
        ),
    question_id: z.number().int().nullable().describe('Parent question id; null for binary single-outcome markets.'),
    question_name: z.string().nullable().describe('Parent question display name; null when `question_id` is null.'),
    status: z.string().describe('`live` while trading, `settled` after resolution.'),
    settle_fraction: z
        .number()
        .nullable()
        .describe(
            'HIP-4 `settleFraction`: payout per Yes share at resolution, in [0, 1]. No share pays `1 - settle_fraction`. Null while live. Binary outcomes resolve to 0 or 1; bounded-options markets can carry fractional values.'
        ),
});

export const outcomeLegContextSchema = outcomeContextSchema.extend({
    coin: z.string().describe('HL-native leg identifier `#<outcome_id*10 + side_index>` (e.g. `#3570`).'),
    side_index: z.number().int().describe('0 = first sideSpec, 1 = second sideSpec.'),
    side_label: z
        .string()
        .describe('Side display label resolved from `outcomeMeta.sideSpecs[side_index]` (e.g. `Yes`, `Argentina`).'),
});

export type OutcomeContext = z.infer<typeof outcomeContextSchema>;
export type OutcomeLegContext = z.infer<typeof outcomeLegContextSchema>;
