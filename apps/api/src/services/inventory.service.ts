import Decimal from 'decimal.js';
import { prisma } from '@erp/db';
import type { CreateProductInput, UpdateProductInput, ProductListQuery } from '@erp/types';
import { recordMovement } from './stockMovement.service.js';
import { computeSellingPrice, getLatestGoldRate, getAllLatestGoldRates } from './pricing.service.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors.js';

/**
 * Generate SKU: {CATEGORY_CODE}-{YYMM}-{SEQ}
 * Retry up to 3 times on collision.
 */
async function generateSku(categoryCode: string): Promise<string> {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `${categoryCode}-${yymm}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    // Count existing products with same prefix to determine sequence
    const count = await prisma.product.count({
      where: { sku: { startsWith: prefix } },
    });
    const seq = String(count + 1 + attempt).padStart(4, '0');
    const sku = `${prefix}-${seq}`;

    const exists = await prisma.product.findUnique({ where: { sku } });
    if (!exists) return sku;
  }

  throw new Error(`SKU generation failed after 3 attempts for prefix ${prefix}`);
}

// ─── Create Product ──────────────────────────────────────────────

export async function createProduct(input: CreateProductInput, userId: string) {
  const netWeight = new Decimal(input.grossWeight).minus(input.stoneWeight);
  if (netWeight.lte(0)) {
    throw new ValidationError('Net weight (grossWeight - stoneWeight) must be > 0');
  }

  // Get category for SKU generation
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new NotFoundError('Category', input.categoryId);

  // Verify vendor exists
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw new NotFoundError('Vendor', input.vendorId);

  const sku = await generateSku(category.code);

  const product = await prisma.$transaction(async (tx) => {
    // Insert product with currentStock = 0
    const p = await tx.product.create({
      data: {
        sku,
        barcode: input.barcode,
        name: input.name,
        categoryId: input.categoryId,
        grossWeight: input.grossWeight,
        netWeight: netWeight.toNumber(),
        stoneWeight: input.stoneWeight,
        goldPurity: input.goldPurity,
        wastagePct: input.wastagePct,
        makingChargesPct: input.makingChargesPct,
        stoneRatePerCt: input.stoneRatePerCt,
        purchasePrice: input.purchasePrice,
        currentStock: 0,
        reorderLevel: input.reorderLevel,
        vendorId: input.vendorId,
        createdById: userId,
      },
    });

    // If initialStock > 0, create OPENING movement
    if (input.initialStock > 0) {
      await recordMovement(tx, {
        productId: p.id,
        type: 'OPENING',
        quantityDelta: input.initialStock,
        userId,
        notes: 'Initial stock at product creation',
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        userId,
        action: 'PRODUCT_CREATE',
        entity: 'Product',
        entityId: p.id,
        after: { ...p, initialStock: input.initialStock },
      },
    });

    return p;
  });

  // Fetch back with computed selling price
  return getProductWithPrice(product.id);
}

// ─── Get Product with computed price ─────────────────────────────

export async function getProductWithPrice(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      vendor: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!product) throw new NotFoundError('Product', id);

  const goldRate = await getLatestGoldRate(product.goldPurity);

  let priceBreakdown = null;
  if (goldRate) {
    priceBreakdown = computeSellingPrice({
      netWeight: product.netWeight.toString(),
      goldRate,
      wastagePct: product.wastagePct.toString(),
      makingChargesPct: product.makingChargesPct.toString(),
      stoneWeight: product.stoneWeight.toString(),
      stoneRatePerCt: product.stoneRatePerCt?.toString() ?? null,
    });
  }

  return {
    ...product,
    sellingPrice: priceBreakdown?.sellingPrice.toFixed(2) ?? null,
    priceBreakdown: priceBreakdown
      ? {
          goldValue: priceBreakdown.goldValue.toFixed(2),
          wastageCost: priceBreakdown.wastageCost.toFixed(2),
          makingCost: priceBreakdown.makingCost.toFixed(2),
          stoneCost: priceBreakdown.stoneCost.toFixed(2),
          goldRate: priceBreakdown.goldRate.toFixed(2),
        }
      : null,
  };
}

// ─── Get Product Detail ──────────────────────────────────────────

export async function getProductDetail(id: string) {
  const product = await getProductWithPrice(id);

  // Last 50 stock movements
  const movements = await prisma.stockMovement.findMany({
    where: { productId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  return { ...product, movements };
}

// ─── List Products ───────────────────────────────────────────────

export async function listProducts(query: ProductListQuery) {
  const { q, categoryId, vendorId, lowStock, page, pageSize } = query;

  const where: Record<string, unknown> = { isActive: true };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      { barcode: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (vendorId) where.vendorId = vendorId;

  const [total, products] = await Promise.all([
    prisma.product.count({ where: where as any }),
    prisma.product.findMany({
      where: where as any,
      include: {
        category: true,
        vendor: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // If lowStock filter, apply post-query (or use raw query for efficiency)
  let filteredProducts = products;
  if (lowStock) {
    filteredProducts = products.filter((p) => p.currentStock <= p.reorderLevel);
  }

  // Compute selling prices for all products in the list
  const goldRates = await getAllLatestGoldRates();

  const productsWithPrices = filteredProducts.map((product) => {
    const rate = goldRates.get(product.goldPurity);
    let sellingPrice: string | null = null;

    if (rate) {
      const breakdown = computeSellingPrice({
        netWeight: product.netWeight.toString(),
        goldRate: rate,
        wastagePct: product.wastagePct.toString(),
        makingChargesPct: product.makingChargesPct.toString(),
        stoneWeight: product.stoneWeight.toString(),
        stoneRatePerCt: product.stoneRatePerCt?.toString() ?? null,
      });
      sellingPrice = breakdown.sellingPrice.toFixed(2);
    }

    return { ...product, sellingPrice };
  });

  return {
    items: productsWithPrices,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─── Update Product ──────────────────────────────────────────────

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  userId: string,
  userRole: 'ADMIN' | 'STAFF',
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Product', id);
  if (!existing.isActive) throw new ValidationError('Cannot edit an inactive product');

  // STAFF cannot edit purchasePrice
  if (userRole === 'STAFF' && input.purchasePrice !== undefined) {
    throw new ForbiddenError('STAFF cannot edit purchase price');
  }

  // Validate weight if either weight field is being updated
  if (input.grossWeight !== undefined || input.stoneWeight !== undefined) {
    const newGross = input.grossWeight ?? Number(existing.grossWeight);
    const newStone = input.stoneWeight ?? Number(existing.stoneWeight);
    const newNet = newGross - newStone;

    if (newNet <= 0) {
      throw new ValidationError('Net weight (grossWeight - stoneWeight) must be > 0');
    }

    (input as any).netWeight = newNet;
  }

  const before = { ...existing };

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.product.update({
      where: { id },
      data: input as any,
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'PRODUCT_UPDATE',
        entity: 'Product',
        entityId: id,
        before: before as any,
        after: p as any,
      },
    });

    return p;
  });

  return getProductWithPrice(updated.id);
}

// ─── Soft Delete Product ─────────────────────────────────────────

export async function softDeleteProduct(id: string, userId: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundError('Product', id);

  // Check if any sale items reference this product
  const saleItemCount = await prisma.saleItem.count({ where: { productId: id } });

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: { isActive: false },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'PRODUCT_DELETE',
        entity: 'Product',
        entityId: id,
        before: { isActive: true },
        after: { isActive: false },
      },
    });
  });

  return { message: 'Product deactivated' };
}

// ─── Low Stock ───────────────────────────────────────────────────

export async function getLowStockProducts() {
  const products = await prisma.$queryRaw<
    Array<Record<string, unknown>>
  >`SELECT p.*, c.name as "categoryName", c.code as "categoryCode"
    FROM "Product" p
    JOIN "Category" c ON p."categoryId" = c.id
    WHERE p."isActive" = true AND p."currentStock" <= p."reorderLevel"
    ORDER BY p."currentStock" ASC`;

  return products;
}

// ─── Gold Rate ───────────────────────────────────────────────────

export async function setGoldRate(purity: string, ratePerGm: number, userId: string) {
  const rate = await prisma.goldRate.create({
    data: {
      purity: purity as any,
      ratePerGm,
      setBy: userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'GOLD_RATE_SET',
      entity: 'GoldRate',
      entityId: rate.id,
      after: { purity, ratePerGm },
    },
  });

  return rate;
}

export async function getGoldRateHistory(purity?: string) {
  const where = purity ? { purity: purity as any } : {};
  return prisma.goldRate.findMany({
    where,
    orderBy: { effectiveFrom: 'desc' },
    take: 50,
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}
