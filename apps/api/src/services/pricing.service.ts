import Decimal from 'decimal.js';
import type { Prisma } from '@erp/db';
import { prisma } from '@erp/db';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface PriceBreakdown {
  netWeight: Decimal;
  goldRate: Decimal;
  goldValue: Decimal;
  wastageCost: Decimal;
  makingCost: Decimal;
  stoneCost: Decimal;
  sellingPrice: Decimal;
}

/**
 * Compute selling price per the spec formula:
 *   goldValue   = netWeight * goldRate
 *   wastageCost = goldValue * (wastagePct / 100)
 *   makingCost  = goldValue * (makingChargesPct / 100)
 *   stoneCost   = stoneWeight * stoneRatePerCt
 *   sellingPrice = goldValue + wastageCost + makingCost + stoneCost
 *
 * GST is applied at POS, NOT here.
 */
export function computeSellingPrice(params: {
  netWeight: Decimal | number | string;
  goldRate: Decimal | number | string;
  wastagePct: Decimal | number | string;
  makingChargesPct: Decimal | number | string;
  stoneWeight: Decimal | number | string;
  stoneRatePerCt: Decimal | number | string | null;
}): PriceBreakdown {
  const netWeight = new Decimal(params.netWeight);
  const goldRate = new Decimal(params.goldRate);
  const wastagePct = new Decimal(params.wastagePct);
  const makingChargesPct = new Decimal(params.makingChargesPct);
  const stoneWeight = new Decimal(params.stoneWeight);
  const stoneRatePerCt = params.stoneRatePerCt ? new Decimal(params.stoneRatePerCt) : new Decimal(0);

  const goldValue = netWeight.mul(goldRate);
  const wastageCost = goldValue.mul(wastagePct).div(100);
  const makingCost = goldValue.mul(makingChargesPct).div(100);
  const stoneCost = stoneWeight.mul(stoneRatePerCt);
  const sellingPrice = goldValue.plus(wastageCost).plus(makingCost).plus(stoneCost);

  return {
    netWeight,
    goldRate,
    goldValue: goldValue.toDecimalPlaces(2),
    wastageCost: wastageCost.toDecimalPlaces(2),
    makingCost: makingCost.toDecimalPlaces(2),
    stoneCost: stoneCost.toDecimalPlaces(2),
    sellingPrice: sellingPrice.toDecimalPlaces(2),
  };
}

/**
 * Fetch the latest gold rate for a given purity.
 * Returns null if no rate exists.
 */
export async function getLatestGoldRate(purity: string): Promise<Decimal | null> {
  const rate = await prisma.goldRate.findFirst({
    where: { purity: purity as Prisma.EnumGoldPurityFilter['equals'] },
    orderBy: { effectiveFrom: 'desc' },
  });
  return rate ? new Decimal(rate.ratePerGm.toString()) : null;
}

/**
 * Fetch latest gold rates for all purities in a single query (for list views).
 */
export async function getAllLatestGoldRates(): Promise<Map<string, Decimal>> {
  const latestRates = await prisma.$queryRaw<
    Array<{ purity: string; ratePerGm: Prisma.Decimal }>
  >`SELECT DISTINCT ON ("purity") "purity", "ratePerGm"
    FROM "GoldRate"
    ORDER BY "purity", "effectiveFrom" DESC`;

  const rates = new Map<string, Decimal>();
  for (const row of latestRates) {
    rates.set(row.purity, new Decimal(row.ratePerGm.toString()));
  }
  return rates;
}
