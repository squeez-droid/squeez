// Protocol constants. These mirror the immutable values in packages/contracts
// (SqueezConstants.sol). Change both together.

export const BPS = 10_000;

/** Fixed 1% protocol fee on every trade (curve and v4 pool). Immutable on-chain. */
export const PROTOCOL_FEE_BPS = 100;
/** Creator fee is set per token at launch: 0–10%. */
export const MAX_CREATOR_FEE_BPS = 1_000;
/** UI step for the creator fee slider (0.5%). */
export const CREATOR_FEE_STEP_BPS = 50;
/** Share of the protocol fee that goes to TWAP buyback & burn of $SQUEEZ (80%). The rest is treasury. */
export const BURN_BPS_OF_PROTOCOL = 8_000;

/** Every Squeez token: 1B supply, 18 decimals, 100% minted to the curve. */
export const TOTAL_SUPPLY = 1_000_000_000;
export const TOKEN_DECIMALS = 18;

/** Supply split (Pons V2 pattern): sold on curve / seeded as LP / locked in the locker. */
export const SUPPLY_SPLIT = {
  curve: 5 / 7,
  liquidity: 10 / 49,
  locked: 4 / 49,
} as const;
