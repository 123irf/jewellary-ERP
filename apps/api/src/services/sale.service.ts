import Decimal from 'decimal.js';
import { prisma } from '@erp/db';
import type { Prisma } from '@erp/db';
import type { CreateSaleInput, SaleListQuery } from '@erp/types';
import { recordMovement } from './stockMovement.service.js';
import { computeSellingPrice, getLatestGoldRate } from './pricing.service.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  AppError,
} from '../lib/errors.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// GST rates (configurable per spec — hardcoded for now, can come from Setting model later)
const GST_RATE_TOTAL = new Decimal('3'); // 3% total for gold jewelry
const GST_HALF = new Decimal('1.5'); // 1.5% each for CGST + SGST

// Rate-change threshold (percentage). Reject if gold rate changed > this since cart load.
const RATE_CHANGE_THRESHOLD_PCT = new Decimal('0.5');

// ─── Pricing Types ──────────────────────────────────────────────

interface LineCalcResult {
  productId: string;
  productName: string;
  sku: string;
  goldPurity: string;
  goldRateAtSale: Decimal;
  netWeight: Decimal;
  stoneWeight: Decimal;
  wastagePct: Decimal;
  makingChargesPct: Decimal;
  quantity: number;
  unitPrice: Decimal;
  lineDiscount: Decimal;
  lineTotal: Decimal;
}

interface SaleCalcResult {
  lines: LineCalcResult[];
  subtotal: Decimal;
  totalDiscount: Decimal;
  taxableAmount: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  grandTotal: Decimal;
}

// ─── Sale Pricing Engine ────────────────────────────────────────

/**
 * Compute the full sale pricing from items + discounts + GST mode.
 * Reads current gold rates and product data from DB.
 * Does NOT persist anything — used by both preview and create.
 */
export async function computeSalePricing(
  input: CreateSaleInput,
  tx?: Prisma.TransactionClient,
): Promise<SaleCalcResult> {
  const db = tx ?? prisma;
  const lines: LineCalcResult[] = [];
  let subtotal = new Decimal(0);
  let totalLineDiscount = new Decimal(0);

  for (const item of input.items) {
    const product = await db.product.findUnique({
      where: { id: item.productId },
    });
    if (!product) throw new NotFoundError('Product', item.productId);
    if (!product.isActive) {
      throw new ValidationError(`Product '${product.name}' is inactive and cannot be sold`);
    }

    const goldRate = await getLatestGoldRate(product.goldPurity);
    if (!goldRate) {
      throw new ValidationError(`No gold rate set for purity ${product.goldPurity}. Set gold rate first.`);
    }

    // Per-line price calculation (same formula as pricing.service)
    const breakdown = computeSellingPrice({
      netWeight: product.netWeight.toString(),
      goldRate,
      wastagePct: product.wastagePct.toString(),
      makingChargesPct: product.makingChargesPct.toString(),
      stoneWeight: product.stoneWeight.toString(),
      stoneRatePerCt: product.stoneRatePerCt?.toString() ?? null,
    });

    const unitPrice = breakdown.sellingPrice;
    const lineBase = unitPrice.mul(item.quantity).toDecimalPlaces(2);

    // Line discount
    let lineDiscount = new Decimal(0);
    if (item.lineDiscount) {
      if (item.lineDiscount.type === 'AMOUNT') {
        lineDiscount = new Decimal(item.lineDiscount.value).toDecimalPlaces(2);
      } else {
        lineDiscount = lineBase.mul(item.lineDiscount.value).div(100).toDecimalPlaces(2);
      }
      if (lineDiscount.gt(lineBase)) {
        throw new ValidationError(`Discount cannot exceed line total for product '${product.name}'`);
      }
      if (lineDiscount.lt(0)) {
        throw new ValidationError('Negative discount is not allowed');
      }
    }

    const lineTotal = lineBase.minus(lineDiscount).toDecimalPlaces(2);

    lines.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      goldPurity: product.goldPurity,
      goldRateAtSale: goldRate,
      netWeight: new Decimal(product.netWeight.toString()),
      stoneWeight: new Decimal(product.stoneWeight.toString()),
      wastagePct: new Decimal(product.wastagePct.toString()),
      makingChargesPct: new Decimal(product.makingChargesPct.toString()),
      quantity: item.quantity,
      unitPrice: unitPrice.toDecimalPlaces(2),
      lineDiscount,
      lineTotal,
    });

    subtotal = subtotal.plus(lineTotal);
    totalLineDiscount = totalLineDiscount.plus(lineDiscount);
  }

  // Bill-level discount
  let billDiscount = new Decimal(0);
  if (input.billDiscount) {
    if (input.billDiscount.type === 'AMOUNT') {
      billDiscount = new Decimal(input.billDiscount.value).toDecimalPlaces(2);
    } else {
      billDiscount = subtotal.mul(input.billDiscount.value).div(100).toDecimalPlaces(2);
    }
    if (billDiscount.gt(subtotal)) {
      throw new ValidationError('Bill discount cannot exceed subtotal');
    }
  }

  const totalDiscount = totalLineDiscount.plus(billDiscount);
  const taxableAmount = subtotal.minus(billDiscount).toDecimalPlaces(2);

  // GST computation
  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);

  if (input.gstMode === 'INTRA') {
    cgst = taxableAmount.mul(GST_HALF).div(100).toDecimalPlaces(2);
    sgst = taxableAmount.mul(GST_HALF).div(100).toDecimalPlaces(2);
  } else {
    igst = taxableAmount.mul(GST_RATE_TOTAL).div(100).toDecimalPlaces(2);
  }

  const grandTotal = taxableAmount.plus(cgst).plus(sgst).plus(igst).toDecimalPlaces(2);

  return {
    lines,
    subtotal,
    totalDiscount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    grandTotal,
  };
}

// ─── Invoice Number Generation ──────────────────────────────────

/**
 * Generate gapless, FY-aware invoice numbers: INV-2025-26-00001
 * Uses SELECT FOR UPDATE on a counter approach via MAX on existing invoices.
 */
async function generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based

  // Indian FY: April to March. FY 2025-26 means Apr 2025 – Mar 2026.
  let fyStart: number;
  let fyEnd: number;
  if (month >= 4) {
    fyStart = year;
    fyEnd = year + 1;
  } else {
    fyStart = year - 1;
    fyEnd = year;
  }

  const fyPrefix = `INV-${fyStart}-${String(fyEnd).slice(2)}`;

  // Get the last invoice number for this FY (row-locked)
  const lastSale = await tx.$queryRawUnsafe<Array<{ invoiceNumber: string }>>(
    `SELECT "invoiceNumber" FROM "Sale" WHERE "invoiceNumber" LIKE $1 ORDER BY "invoiceNumber" DESC LIMIT 1 FOR UPDATE`,
    `${fyPrefix}-%`,
  );

  let seq = 1;
  if (lastSale.length > 0) {
    const lastNum = lastSale[0].invoiceNumber;
    const lastSeq = parseInt(lastNum.split('-').pop()!, 10);
    seq = lastSeq + 1;
  }

  return `${fyPrefix}-${String(seq).padStart(5, '0')}`;
}

// ─── Create Sale ────────────────────────────────────────────────

export async function createSale(
  input: CreateSaleInput,
  userId: string,
  idempotencyKey?: string,
) {
  // Idempotency check: if key provided, look for existing sale
  if (idempotencyKey) {
    const existing = await prisma.auditLog.findFirst({
      where: {
        action: 'SALE_CREATE',
        entity: 'Sale',
        after: { path: ['idempotencyKey'], equals: idempotencyKey },
      },
      select: { entityId: true },
    });
    if (existing) {
      // Return the original sale
      return getSaleDetail(existing.entityId);
    }
  }

  // Validate customer if provided
  if (input.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) throw new NotFoundError('Customer', input.customerId);
  }

  const sale = await prisma.$transaction(async (tx) => {
    // 1. Compute pricing inside transaction (locks gold rate reads to this point)
    const calc = await computeSalePricing(input, tx);

    // 2. Validate payment sum equals grand total
    const paymentSum = input.payments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0),
    ).toDecimalPlaces(2);

    if (!paymentSum.eq(calc.grandTotal)) {
      throw new ValidationError(
        `Payment total (${paymentSum.toFixed(2)}) does not match grand total (${calc.grandTotal.toFixed(2)})`,
        { paymentSum: paymentSum.toFixed(2), grandTotal: calc.grandTotal.toFixed(2) },
      );
    }

    // 3. Verify stock for all items (SELECT FOR UPDATE happens in recordMovement)
    //    We do a pre-check here for better error messages
    for (const line of calc.lines) {
      const [product] = await tx.$queryRawUnsafe<Array<{ id: string; currentStock: number; name: string }>>(
        `SELECT "id", "currentStock", "name" FROM "Product" WHERE "id" = $1 FOR UPDATE`,
        line.productId,
      );
      if (!product) throw new NotFoundError('Product', line.productId);
      if (product.currentStock < line.quantity) {
        throw new ValidationError(
          `Insufficient stock for '${line.productName}': requested ${line.quantity}, available ${product.currentStock}`,
          { productId: line.productId, requested: line.quantity, available: product.currentStock },
        );
      }
    }

    // 4. Generate invoice number (gapless, FY-aware)
    const invoiceNumber = await generateInvoiceNumber(tx);

    // 5. Compute credit amount
    const creditAmount = input.payments
      .filter((p) => p.mode === 'CREDIT')
      .reduce((sum, p) => sum.plus(new Decimal(p.amount)), new Decimal(0))
      .toDecimalPlaces(2);

    const amountPaid = calc.grandTotal.minus(creditAmount).toDecimalPlaces(2);

    // 6. Insert Sale
    const saleRecord = await tx.sale.create({
      data: {
        invoiceNumber,
        customerId: input.customerId ?? null,
        customerWalkIn: input.walkIn ?? false,
        subtotal: calc.subtotal.toFixed(2),
        totalDiscount: calc.totalDiscount.toFixed(2),
        taxableAmount: calc.taxableAmount.toFixed(2),
        cgst: calc.cgst.toFixed(2),
        sgst: calc.sgst.toFixed(2),
        igst: calc.igst.toFixed(2),
        grandTotal: calc.grandTotal.toFixed(2),
        amountPaid: amountPaid.toFixed(2),
        creditAmount: creditAmount.toFixed(2),
        status: 'COMPLETED',
        notes: input.notes ?? null,
        createdById: userId,
      },
    });

    // 7. Insert SaleItems
    for (const line of calc.lines) {
      await tx.saleItem.create({
        data: {
          saleId: saleRecord.id,
          productId: line.productId,
          productName: line.productName,
          sku: line.sku,
          goldPurity: line.goldPurity,
          goldRateAtSale: line.goldRateAtSale.toFixed(2),
          netWeight: line.netWeight.toFixed(3),
          stoneWeight: line.stoneWeight.toFixed(3),
          wastagePct: line.wastagePct.toFixed(2),
          makingChargesPct: line.makingChargesPct.toFixed(2),
          quantity: line.quantity,
          unitPrice: line.unitPrice.toFixed(2),
          lineDiscount: line.lineDiscount.toFixed(2),
          lineTotal: line.lineTotal.toFixed(2),
        },
      });
    }

    // 8. Insert Payments
    for (const payment of input.payments) {
      await tx.payment.create({
        data: {
          saleId: saleRecord.id,
          mode: payment.mode,
          amount: new Decimal(payment.amount).toFixed(2),
          reference: payment.reference ?? null,
        },
      });
    }

    // 9. Decrement stock via recordMovement for each line
    for (const line of calc.lines) {
      await recordMovement(tx, {
        productId: line.productId,
        type: 'SALE',
        quantityDelta: -line.quantity,
        saleId: saleRecord.id,
        userId,
        notes: `Sale ${invoiceNumber}`,
      });
    }

    // 10. If credit portion > 0, create CustomerDue
    if (creditAmount.gt(0) && input.customerId) {
      await tx.customerDue.create({
        data: {
          customerId: input.customerId,
          saleId: saleRecord.id,
          originalAmount: creditAmount.toFixed(2),
          paidAmount: '0',
          balanceAmount: creditAmount.toFixed(2),
          status: 'PENDING',
        },
      });

      // Update Customer.totalDue
      await tx.customer.update({
        where: { id: input.customerId },
        data: {
          totalDue: {
            increment: parseFloat(creditAmount.toFixed(2)),
          },
        },
      });
    }

    // 11. Audit log
    await tx.auditLog.create({
      data: {
        userId,
        action: 'SALE_CREATE',
        entity: 'Sale',
        entityId: saleRecord.id,
        after: {
          invoiceNumber,
          grandTotal: calc.grandTotal.toFixed(2),
          itemCount: calc.lines.length,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      },
    });

    return saleRecord;
  });

  // Return full sale detail
  return getSaleDetail(sale.id);
}

// ─── Preview Sale ───────────────────────────────────────────────

export async function previewSale(input: CreateSaleInput) {
  const calc = await computeSalePricing(input);

  return {
    lines: calc.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      sku: l.sku,
      goldPurity: l.goldPurity,
      goldRateAtSale: l.goldRateAtSale.toFixed(2),
      netWeight: l.netWeight.toFixed(3),
      quantity: l.quantity,
      unitPrice: l.unitPrice.toFixed(2),
      lineDiscount: l.lineDiscount.toFixed(2),
      lineTotal: l.lineTotal.toFixed(2),
    })),
    subtotal: calc.subtotal.toFixed(2),
    totalDiscount: calc.totalDiscount.toFixed(2),
    taxableAmount: calc.taxableAmount.toFixed(2),
    cgst: calc.cgst.toFixed(2),
    sgst: calc.sgst.toFixed(2),
    igst: calc.igst.toFixed(2),
    grandTotal: calc.grandTotal.toFixed(2),
  };
}

// ─── Get Sale Detail ────────────────────────────────────────────

export async function getSaleDetail(id: string) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: { select: { id: true, name: true, currentStock: true } },
        },
      },
      payments: true,
      movements: {
        include: {
          product: { select: { id: true, name: true } },
        },
      },
      due: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!sale) throw new NotFoundError('Sale', id);

  return sale;
}

// ─── List Sales ─────────────────────────────────────────────────

export async function listSales(query: SaleListQuery) {
  const { from, to, customerId, status, paymentMode, q, page, pageSize } = query;

  const where: Record<string, unknown> = {};

  // Date range
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  if (customerId) where.customerId = customerId;
  if (status) where.status = status;

  // Invoice number search
  if (q) {
    where.invoiceNumber = { contains: q, mode: 'insensitive' };
  }

  // Payment mode filter: find sales that have at least one payment with this mode
  if (paymentMode) {
    where.payments = { some: { mode: paymentMode } };
  }

  const [total, sales] = await Promise.all([
    prisma.sale.count({ where: where as any }),
    prisma.sale.findMany({
      where: where as any,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: { select: { mode: true, amount: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: sales,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─── Void Sale ──────────────────────────────────────────────────

export async function voidSale(id: string, userId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: true,
      due: true,
    },
  });

  if (!sale) throw new NotFoundError('Sale', id);
  if (sale.status === 'VOIDED') {
    throw new ValidationError('Sale is already voided');
  }

  await prisma.$transaction(async (tx) => {
    // 1. Set status = VOIDED
    await tx.sale.update({
      where: { id },
      data: { status: 'VOIDED' },
    });

    // 2. Reverse stock for each SaleItem
    for (const item of sale.items) {
      await recordMovement(tx, {
        productId: item.productId,
        type: 'VOID_REVERSAL',
        quantityDelta: item.quantity, // positive = add back
        saleId: id,
        userId,
        notes: `Void reversal for sale ${sale.invoiceNumber}`,
      });
    }

    // 3. Handle CustomerDue if exists
    if (sale.due) {
      const due = sale.due;

      if (new Decimal(due.paidAmount.toString()).gt(0)) {
        // Partially paid: cancel remaining, convert paid portion to CustomerCredit
        await tx.customerDue.update({
          where: { id: due.id },
          data: {
            status: 'VOIDED',
            balanceAmount: 0,
            clearedAt: new Date(),
          },
        });

        // Create credit for the paid portion
        const paidAmount = new Decimal(due.paidAmount.toString());
        if (paidAmount.gt(0)) {
          await tx.customerCredit.create({
            data: {
              customerId: due.customerId,
              amount: paidAmount.toFixed(2),
              source: 'VOID_REFUND',
              sourceRefId: sale.id,
              notes: `Refund from voided sale ${sale.invoiceNumber}`,
            },
          });
        }

        // Adjust Customer.totalDue by remaining balance only
        const remainingBalance = new Decimal(due.balanceAmount.toString());
        if (remainingBalance.gt(0)) {
          await tx.customer.update({
            where: { id: due.customerId },
            data: {
              totalDue: { decrement: parseFloat(remainingBalance.toFixed(2)) },
            },
          });
        }
      } else {
        // No payments on the due — simply void it
        await tx.customerDue.update({
          where: { id: due.id },
          data: {
            status: 'VOIDED',
            balanceAmount: 0,
            clearedAt: new Date(),
          },
        });

        // Reduce Customer.totalDue by full original amount
        await tx.customer.update({
          where: { id: due.customerId },
          data: {
            totalDue: { decrement: parseFloat(new Decimal(due.originalAmount.toString()).toFixed(2)) },
          },
        });
      }
    }

    // 4. Audit log
    await tx.auditLog.create({
      data: {
        userId,
        action: 'SALE_VOID',
        entity: 'Sale',
        entityId: id,
        before: { status: 'COMPLETED' },
        after: { status: 'VOIDED', invoiceNumber: sale.invoiceNumber },
      },
    });
  });

  return getSaleDetail(id);
}
