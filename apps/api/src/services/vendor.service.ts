import Decimal from 'decimal.js';
import { prisma } from '@erp/db';
import type {
  CreateVendorInput,
  UpdateVendorInput,
  VendorListQuery,
  CreateVendorTransactionInput,
  VendorLedgerQuery,
} from '@erp/types';
import { recordMovement } from './stockMovement.service.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../lib/errors.js';

// ─── Direction map per txnType ───────────────────────────────────

const TXN_DIRECTION: Record<string, 'CREDIT' | 'DEBIT'> = {
  OPENING_BALANCE: 'CREDIT',
  PURCHASE: 'CREDIT',
  RETURN: 'DEBIT',
  PAYMENT: 'DEBIT',
  ADVANCE: 'DEBIT',
  CREDIT_NOTE: 'DEBIT',
  DEBIT_NOTE: 'CREDIT',
  // ADJUSTMENT: determined by body.direction
};

// ─── Vendor code generation ──────────────────────────────────────

async function generateVendorCode(): Promise<string> {
  const count = await prisma.vendor.count();
  return `VEN-${String(count + 1).padStart(4, '0')}`;
}

// ─── Create Vendor ───────────────────────────────────────────────

export async function createVendor(input: CreateVendorInput, userId: string) {
  const code = await generateVendorCode();

  const vendor = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.create({
      data: {
        code,
        name: input.name,
        phone: input.phone,
        contactPerson: input.contactPerson,
        email: input.email,
        gstin: input.gstin,
        address: input.address,
        runningBalance: 0,
      },
    });

    // If openingBalance > 0, create OPENING_BALANCE transaction
    if (input.openingBalance && input.openingBalance > 0) {
      const newBalance = new Decimal(input.openingBalance);

      await tx.vendorTransaction.create({
        data: {
          vendorId: v.id,
          txnType: 'OPENING_BALANCE',
          direction: 'CREDIT',
          amount: input.openingBalance,
          balanceAfter: newBalance.toNumber(),
          createdById: userId,
          notes: 'Opening balance at vendor creation',
        },
      });

      await tx.vendor.update({
        where: { id: v.id },
        data: { runningBalance: newBalance.toNumber() },
      });
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: 'VENDOR_CREATE',
        entity: 'Vendor',
        entityId: v.id,
        after: { ...v, openingBalance: input.openingBalance },
      },
    });

    return v;
  });

  return getVendorById(vendor.id);
}

// ─── List Vendors ────────────────────────────────────────────────

export async function listVendors(query: VendorListQuery) {
  const { q, hasBalance, page, pageSize } = query;

  const where: Record<string, unknown> = { isActive: true };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ];
  }
  if (hasBalance) {
    where.runningBalance = { not: 0 };
  }

  const [total, vendors] = await Promise.all([
    prisma.vendor.count({ where: where as any }),
    prisma.vendor.findMany({
      where: where as any,
      orderBy: { runningBalance: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: vendors,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// ─── Get Vendor by ID ────────────────────────────────────────────

export async function getVendorById(id: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw new NotFoundError('Vendor', id);
  return vendor;
}

// ─── Get Vendor Profile + Summary ────────────────────────────────

export async function getVendorProfile(id: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw new NotFoundError('Vendor', id);

  // Lifetime totals
  const [purchaseTotal, paymentTotal, lastTxns] = await Promise.all([
    prisma.vendorTransaction.aggregate({
      where: { vendorId: id, txnType: 'PURCHASE' },
      _sum: { amount: true },
    }),
    prisma.vendorTransaction.aggregate({
      where: { vendorId: id, direction: 'DEBIT' },
      _sum: { amount: true },
    }),
    prisma.vendorTransaction.findMany({
      where: { vendorId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    ...vendor,
    summary: {
      lifetimePurchases: purchaseTotal._sum.amount?.toString() ?? '0',
      lifetimePayments: paymentTotal._sum.amount?.toString() ?? '0',
      currentBalance: vendor.runningBalance.toString(),
    },
    recentTransactions: lastTxns,
  };
}

// ─── Update Vendor ───────────────────────────────────────────────

export async function updateVendor(id: string, input: UpdateVendorInput, userId: string) {
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Vendor', id);

  const before = { ...existing };
  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({ where: { id }, data: input as any });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'VENDOR_UPDATE',
        entity: 'Vendor',
        entityId: id,
        before: before as any,
        after: v as any,
      },
    });
    return v;
  });

  return updated;
}

// ─── Soft Delete Vendor ──────────────────────────────────────────

export async function softDeleteVendor(id: string, userId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw new NotFoundError('Vendor', id);

  // Block if runningBalance != 0
  if (!new Decimal(vendor.runningBalance.toString()).eq(0)) {
    throw new ConflictError('Cannot delete vendor with non-zero balance. Settle balance first.', {
      runningBalance: vendor.runningBalance.toString(),
    });
  }

  // Block if active products reference this vendor
  const activeProductCount = await prisma.product.count({
    where: { vendorId: id, isActive: true },
  });
  if (activeProductCount > 0) {
    throw new ConflictError(`Cannot delete vendor with ${activeProductCount} active products.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.vendor.update({ where: { id }, data: { isActive: false } });
    await tx.auditLog.create({
      data: {
        userId,
        action: 'VENDOR_DELETE',
        entity: 'Vendor',
        entityId: id,
        before: { isActive: true },
        after: { isActive: false },
      },
    });
  });

  return { message: 'Vendor deactivated' };
}

// ─── Create Vendor Transaction ───────────────────────────────────

export async function createVendorTransaction(
  vendorId: string,
  input: CreateVendorTransactionInput,
  userId: string,
  userRole: 'ADMIN' | 'STAFF',
) {
  // STAFF cannot create ADJUSTMENT
  if (input.txnType === 'ADJUSTMENT' && userRole === 'STAFF') {
    throw new ForbiddenError('STAFF cannot create ADJUSTMENT transactions');
  }

  // Determine direction
  const direction = input.txnType === 'ADJUSTMENT'
    ? input.direction!
    : TXN_DIRECTION[input.txnType];

  // Validate item totals for PURCHASE/RETURN
  if (input.txnType === 'PURCHASE' || input.txnType === 'RETURN') {
    const itemsTotal = input.items!.reduce((sum, item) => {
      return sum.plus(new Decimal(item.quantity).mul(item.ratePerUnit));
    }, new Decimal(0));

    if (!itemsTotal.eq(new Decimal(input.amount))) {
      throw new ValidationError(
        `Amount (${input.amount}) must equal sum of item line totals (${itemsTotal.toFixed(2)})`,
        { amount: input.amount, itemsTotal: itemsTotal.toFixed(2) },
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // Row-level lock on Vendor for concurrency safety
    const [vendor] = await tx.$queryRawUnsafe<Array<{ id: string; runningBalance: number }>>(
      `SELECT "id", "runningBalance" FROM "Vendor" WHERE "id" = $1 FOR UPDATE`,
      vendorId,
    );
    if (!vendor) throw new NotFoundError('Vendor', vendorId);

    // Compute new balance
    const currentBalance = new Decimal(vendor.runningBalance);
    const amount = new Decimal(input.amount);
    const newBalance = direction === 'CREDIT'
      ? currentBalance.plus(amount)
      : currentBalance.minus(amount);

    // Create transaction
    const txn = await tx.vendorTransaction.create({
      data: {
        vendorId,
        txnType: input.txnType as any,
        direction: direction as any,
        amount: input.amount,
        balanceAfter: newBalance.toNumber(),
        referenceNo: input.referenceNo,
        notes: input.notes,
        txnDate: input.txnDate ? new Date(input.txnDate) : new Date(),
        createdById: userId,
      },
    });

    // Create transaction items (for PURCHASE/RETURN)
    if (input.items && input.items.length > 0) {
      for (const item of input.items) {
        // Verify product is active
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, isActive: true },
        });
        if (!product || !product.isActive) {
          throw new ValidationError(`Product ${item.productId} is inactive or not found`);
        }

        const lineTotal = new Decimal(item.quantity).mul(item.ratePerUnit);
        await tx.vendorTransactionItem.create({
          data: {
            vendorTxnId: txn.id,
            productId: item.productId,
            quantity: item.quantity,
            ratePerUnit: item.ratePerUnit,
            lineTotal: lineTotal.toNumber(),
          },
        });

        // Stock impact
        if (input.txnType === 'PURCHASE') {
          await recordMovement(tx, {
            productId: item.productId,
            type: 'PURCHASE',
            quantityDelta: item.quantity,
            vendorTxnId: txn.id,
            userId,
            notes: `Purchase from ${vendorId}${input.referenceNo ? ` ref: ${input.referenceNo}` : ''}`,
          });
        } else if (input.txnType === 'RETURN') {
          await recordMovement(tx, {
            productId: item.productId,
            type: 'RETURN_OUT',
            quantityDelta: -item.quantity,
            vendorTxnId: txn.id,
            userId,
            notes: `Return to ${vendorId}${input.referenceNo ? ` ref: ${input.referenceNo}` : ''}`,
          });
        }
      }
    }

    // Update vendor running balance
    await tx.vendor.update({
      where: { id: vendorId },
      data: { runningBalance: newBalance.toNumber() },
    });

    // Audit log
    const action = input.txnType === 'ADJUSTMENT' ? 'VENDOR_ADJUSTMENT' : 'VENDOR_TXN_CREATE';
    await tx.auditLog.create({
      data: {
        userId,
        action,
        entity: 'VendorTransaction',
        entityId: txn.id,
        after: {
          txnType: input.txnType,
          direction,
          amount: input.amount,
          balanceAfter: newBalance.toFixed(2),
          vendorId,
        },
      },
    });

    return txn;
  });

  return result;
}

// ─── Get Vendor Ledger ───────────────────────────────────────────

export async function getVendorLedger(vendorId: string, query: VendorLedgerQuery) {
  const { from, to, txnType, q, page, pageSize } = query;

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor', vendorId);

  const where: Record<string, unknown> = { vendorId };
  if (from || to) {
    where.txnDate = {};
    if (from) (where.txnDate as any).gte = new Date(from);
    if (to) (where.txnDate as any).lte = new Date(to);
  }
  if (txnType) where.txnType = txnType;
  if (q) {
    where.OR = [
      { referenceNo: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, transactions] = await Promise.all([
    prisma.vendorTransaction.count({ where: where as any }),
    prisma.vendorTransaction.findMany({
      where: where as any,
      orderBy: { txnDate: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdBy: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    }),
  ]);

  return {
    items: transactions,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// ─── Export Ledger (CSV) ─────────────────────────────────────────

export async function exportVendorLedger(vendorId: string, from?: string, to?: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor', vendorId);

  const where: Record<string, unknown> = { vendorId };
  if (from || to) {
    where.txnDate = {};
    if (from) (where.txnDate as any).gte = new Date(from);
    if (to) (where.txnDate as any).lte = new Date(to);
  }

  const transactions = await prisma.vendorTransaction.findMany({
    where: where as any,
    orderBy: { txnDate: 'asc' },
    include: { createdBy: { select: { name: true } } },
  });

  // Compute opening balance (sum of all txns before the range)
  let openingBalance = new Decimal(0);
  if (from) {
    const priorTxns = await prisma.vendorTransaction.findMany({
      where: { vendorId, txnDate: { lt: new Date(from) } },
      select: { direction: true, amount: true },
    });
    for (const t of priorTxns) {
      openingBalance = t.direction === 'CREDIT'
        ? openingBalance.plus(t.amount.toString())
        : openingBalance.minus(t.amount.toString());
    }
  }

  const closingBalance = transactions.length > 0
    ? new Decimal(transactions[transactions.length - 1].balanceAfter.toString())
    : openingBalance;

  // Build CSV
  const header = 'Date,Type,Direction,Amount,Balance After,Reference,Notes,Created By';
  const rows = transactions.map((t) => {
    const date = t.txnDate.toISOString().split('T')[0];
    return `${date},${t.txnType},${t.direction},${t.amount},${t.balanceAfter},${t.referenceNo || ''},${(t.notes || '').replace(/,/g, ';')},${t.createdBy.name}`;
  });

  const csv = [
    `Vendor: ${vendor.name} (${vendor.code})`,
    `Opening Balance: ${openingBalance.toFixed(2)}`,
    `Closing Balance: ${closingBalance.toFixed(2)}`,
    '',
    header,
    ...rows,
  ].join('\n');

  return { csv, vendor, openingBalance: openingBalance.toFixed(2), closingBalance: closingBalance.toFixed(2) };
}
