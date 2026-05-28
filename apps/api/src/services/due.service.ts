import Decimal from 'decimal.js';
import { prisma } from '@erp/db';
import type { CollectDuePaymentInput, ClearDueInput, WriteOffDueInput, DueListQuery } from '@erp/types';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../lib/errors.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── List Dues ───────────────────────────────────────────────────

export async function listDues(query: DueListQuery) {
  const { customerId, status, overdue, from, to, page, pageSize } = query;

  const where: Record<string, unknown> = {};

  if (customerId) where.customerId = customerId;
  if (status) where.status = status;

  // Overdue: dueDate exists and is in the past, status is open
  if (overdue) {
    where.dueDate = { lt: new Date() };
    where.status = { in: ['PENDING', 'PARTIAL'] };
  }

  // Date range on createdAt
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  const [total, dues] = await Promise.all([
    prisma.customerDue.count({ where: where as any }),
    prisma.customerDue.findMany({
      where: where as any,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        sale: { select: { id: true, invoiceNumber: true, grandTotal: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: dues,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─── Get Due Detail ──────────────────────────────────────────────

export async function getDueDetail(id: string) {
  const due = await prisma.customerDue.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, totalDue: true } },
      sale: {
        select: {
          id: true,
          invoiceNumber: true,
          grandTotal: true,
          status: true,
          createdAt: true,
        },
      },
      payments: {
        include: {
          receivedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!due) throw new NotFoundError('CustomerDue', id);

  return due;
}

// ─── Collect Payment ─────────────────────────────────────────────

export async function collectPayment(
  dueId: string,
  input: CollectDuePaymentInput,
  userId: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Lock the due row
    const [due] = await tx.$queryRawUnsafe<Array<{
      id: string;
      customerId: string;
      saleId: string;
      originalAmount: string;
      paidAmount: string;
      balanceAmount: string;
      status: string;
    }>>(
      `SELECT "id", "customerId", "saleId", "originalAmount"::text, "paidAmount"::text, "balanceAmount"::text, "status" FROM "CustomerDue" WHERE "id" = $1 FOR UPDATE`,
      dueId,
    );

    if (!due) throw new NotFoundError('CustomerDue', dueId);

    // 2. Reject if already cleared or voided
    if (due.status === 'CLEARED' || due.status === 'VOIDED') {
      throw new ConflictError(`Due is already ${due.status} and cannot accept payments`);
    }

    const balance = new Decimal(due.balanceAmount);
    const paymentAmount = new Decimal(input.amount);
    const appliedAmount = Decimal.min(paymentAmount, balance);
    const excess = paymentAmount.minus(appliedAmount);

    // 3. Insert payment record
    await tx.customerDuePayment.create({
      data: {
        dueId,
        mode: input.mode,
        amount: paymentAmount.toFixed(2),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        receivedById: userId,
      },
    });

    // 4. Update due amounts & status
    const newPaidAmount = new Decimal(due.paidAmount).plus(appliedAmount);
    const newBalance = balance.minus(appliedAmount);
    const newStatus = newBalance.eq(0) ? 'CLEARED' : 'PARTIAL';

    await tx.customerDue.update({
      where: { id: dueId },
      data: {
        paidAmount: newPaidAmount.toFixed(2),
        balanceAmount: newBalance.toFixed(2),
        status: newStatus,
        clearedAt: newStatus === 'CLEARED' ? new Date() : undefined,
      },
    });

    // 5. Handle overpayment → credit
    if (excess.gt(0)) {
      await tx.customerCredit.create({
        data: {
          customerId: due.customerId,
          amount: excess.toFixed(2),
          source: 'OVERPAYMENT',
          sourceRefId: dueId,
          notes: `Overpayment on due collection`,
        },
      });
    }

    // 6. Decrement Customer.totalDue by applied amount
    await tx.customer.update({
      where: { id: due.customerId },
      data: {
        totalDue: { decrement: parseFloat(appliedAmount.toFixed(2)) },
      },
    });

    // 7. Audit log
    await tx.auditLog.create({
      data: {
        userId,
        action: 'DUE_PAYMENT_COLLECT',
        entity: 'CustomerDue',
        entityId: dueId,
        before: {
          paidAmount: due.paidAmount,
          balanceAmount: due.balanceAmount,
          status: due.status,
        },
        after: {
          paidAmount: newPaidAmount.toFixed(2),
          balanceAmount: newBalance.toFixed(2),
          status: newStatus,
          paymentAmount: paymentAmount.toFixed(2),
          excess: excess.toFixed(2),
        },
      },
    });

    return { newStatus, excess };
  });

  const detail = await getDueDetail(dueId);
  return {
    due: detail,
    creditIssued: result.excess.gt(0) ? result.excess.toFixed(2) : null,
  };
}

// ─── Force-Clear ─────────────────────────────────────────────────

export async function clearDue(
  dueId: string,
  input: ClearDueInput,
  userId: string,
) {
  const due = await prisma.customerDue.findUnique({ where: { id: dueId } });
  if (!due) throw new NotFoundError('CustomerDue', dueId);

  if (due.status === 'CLEARED' || due.status === 'VOIDED') {
    throw new ConflictError(`Due is already ${due.status}`);
  }

  const balance = new Decimal(due.balanceAmount.toString());
  if (balance.lte(0)) {
    throw new ValidationError('Due has no remaining balance');
  }

  // Delegate to collectPayment with exact balance amount
  return collectPayment(dueId, {
    mode: input.mode,
    amount: parseFloat(balance.toFixed(2)),
    reference: input.reference,
  }, userId);
}

// ─── Write-Off ───────────────────────────────────────────────────

export async function writeOffDue(
  dueId: string,
  input: WriteOffDueInput,
  userId: string,
) {
  await prisma.$transaction(async (tx) => {
    // Lock row
    const [due] = await tx.$queryRawUnsafe<Array<{
      id: string;
      customerId: string;
      balanceAmount: string;
      status: string;
    }>>(
      `SELECT "id", "customerId", "balanceAmount"::text, "status" FROM "CustomerDue" WHERE "id" = $1 FOR UPDATE`,
      dueId,
    );

    if (!due) throw new NotFoundError('CustomerDue', dueId);

    if (due.status === 'CLEARED' || due.status === 'VOIDED') {
      throw new ConflictError(`Due is already ${due.status}`);
    }

    const balance = new Decimal(due.balanceAmount);

    // Mark as cleared with zero balance
    await tx.customerDue.update({
      where: { id: dueId },
      data: {
        status: 'CLEARED',
        balanceAmount: '0',
        clearedAt: new Date(),
      },
    });

    // Decrement Customer.totalDue
    await tx.customer.update({
      where: { id: due.customerId },
      data: {
        totalDue: { decrement: parseFloat(balance.toFixed(2)) },
      },
    });

    // Audit log with reason
    await tx.auditLog.create({
      data: {
        userId,
        action: 'DUE_WRITE_OFF',
        entity: 'CustomerDue',
        entityId: dueId,
        before: { balanceAmount: due.balanceAmount, status: due.status },
        after: { balanceAmount: '0', status: 'CLEARED', reason: input.reason },
      },
    });
  });

  return getDueDetail(dueId);
}

// ─── Customer Dues Summary ───────────────────────────────────────

export async function getCustomerDuesSummary(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, totalDue: true },
  });
  if (!customer) throw new NotFoundError('Customer', customerId);

  const now = new Date();

  // Get open dues for this customer
  const openDues = await prisma.customerDue.findMany({
    where: {
      customerId,
      status: { in: ['PENDING', 'PARTIAL'] },
    },
    select: {
      balanceAmount: true,
      dueDate: true,
      createdAt: true,
    },
  });

  // Count overdue
  const overdueCount = openDues.filter(
    (d) => d.dueDate && d.dueDate < now,
  ).length;

  // Get active credits total
  const credits = await prisma.customerCredit.aggregate({
    where: { customerId, isActive: true },
    _sum: { amount: true },
  });

  // Compute aging buckets
  const buckets = {
    current: new Decimal(0),
    '1-30days': new Decimal(0),
    '31-60days': new Decimal(0),
    '61-90days': new Decimal(0),
    '90plus': new Decimal(0),
  };

  for (const due of openDues) {
    const ageDate = due.dueDate ?? due.createdAt;
    const ageMs = now.getTime() - ageDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const balance = new Decimal(due.balanceAmount.toString());

    if (ageDays <= 0) {
      buckets.current = buckets.current.plus(balance);
    } else if (ageDays <= 30) {
      buckets['1-30days'] = buckets['1-30days'].plus(balance);
    } else if (ageDays <= 60) {
      buckets['31-60days'] = buckets['31-60days'].plus(balance);
    } else if (ageDays <= 90) {
      buckets['61-90days'] = buckets['61-90days'].plus(balance);
    } else {
      buckets['90plus'] = buckets['90plus'].plus(balance);
    }
  }

  return {
    totalDue: customer.totalDue.toString(),
    openCount: openDues.length,
    overdueCount,
    credits: credits._sum.amount?.toString() ?? '0.00',
    agingBuckets: {
      current: buckets.current.toFixed(2),
      '1-30days': buckets['1-30days'].toFixed(2),
      '31-60days': buckets['31-60days'].toFixed(2),
      '61-90days': buckets['61-90days'].toFixed(2),
      '90plus': buckets['90plus'].toFixed(2),
    },
  };
}

// ─── Portfolio Aging Report ──────────────────────────────────────

export async function getAgingReport() {
  const now = new Date();

  const openDues = await prisma.customerDue.findMany({
    where: {
      status: { in: ['PENDING', 'PARTIAL'] },
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  const buckets = {
    current: new Decimal(0),
    '1-30days': new Decimal(0),
    '31-60days': new Decimal(0),
    '61-90days': new Decimal(0),
    '90plus': new Decimal(0),
  };

  let totalOutstanding = new Decimal(0);

  for (const due of openDues) {
    const ageDate = due.dueDate ?? due.createdAt;
    const ageMs = now.getTime() - ageDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const balance = new Decimal(due.balanceAmount.toString());

    totalOutstanding = totalOutstanding.plus(balance);

    if (ageDays <= 0) {
      buckets.current = buckets.current.plus(balance);
    } else if (ageDays <= 30) {
      buckets['1-30days'] = buckets['1-30days'].plus(balance);
    } else if (ageDays <= 60) {
      buckets['31-60days'] = buckets['31-60days'].plus(balance);
    } else if (ageDays <= 90) {
      buckets['61-90days'] = buckets['61-90days'].plus(balance);
    } else {
      buckets['90plus'] = buckets['90plus'].plus(balance);
    }
  }

  // Group by customer
  const byCustomer = new Map<string, {
    customer: { id: string; name: string; phone: string };
    totalDue: Decimal;
    dueCount: number;
  }>();

  for (const due of openDues) {
    const existing = byCustomer.get(due.customerId);
    const balance = new Decimal(due.balanceAmount.toString());
    if (existing) {
      existing.totalDue = existing.totalDue.plus(balance);
      existing.dueCount += 1;
    } else {
      byCustomer.set(due.customerId, {
        customer: due.customer,
        totalDue: balance,
        dueCount: 1,
      });
    }
  }

  const customerBreakdown = Array.from(byCustomer.values())
    .map((c) => ({
      customer: c.customer,
      totalDue: c.totalDue.toFixed(2),
      dueCount: c.dueCount,
    }))
    .sort((a, b) => parseFloat(b.totalDue) - parseFloat(a.totalDue));

  return {
    totalOutstanding: totalOutstanding.toFixed(2),
    totalDues: openDues.length,
    totalCustomers: byCustomer.size,
    agingBuckets: {
      current: buckets.current.toFixed(2),
      '1-30days': buckets['1-30days'].toFixed(2),
      '31-60days': buckets['31-60days'].toFixed(2),
      '61-90days': buckets['61-90days'].toFixed(2),
      '90plus': buckets['90plus'].toFixed(2),
    },
    customerBreakdown,
  };
}
