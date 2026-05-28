import { PrismaClient, UserRole, GoldPurity } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@jewellery-erp.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const name = process.env.SEED_ADMIN_NAME || 'System Admin';

  // Seed ADMIN user
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
  console.log(`Seeded admin user: ${admin.email} (${admin.id})`);

  // Seed categories
  const categories = [
    { name: 'Rings', code: 'RNG', description: 'Gold and diamond rings' },
    { name: 'Bangles', code: 'BNG', description: 'Gold bangles and kadas' },
    { name: 'Necklaces', code: 'NKL', description: 'Necklaces and chains' },
    { name: 'Earrings', code: 'ERG', description: 'Earrings and jhumkas' },
    { name: 'Pendants', code: 'PND', description: 'Pendants and lockets' },
    { name: 'Bracelets', code: 'BRC', description: 'Bracelets and kadas' },
    { name: 'Chains', code: 'CHN', description: 'Gold chains' },
    { name: 'Mangalsutra', code: 'MGS', description: 'Mangalsutras' },
    { name: 'Nose Pins', code: 'NSP', description: 'Nose pins and rings' },
    { name: 'Other', code: 'OTH', description: 'Miscellaneous jewelry' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }
  console.log(`Seeded ${categories.length} categories`);

  // Seed initial gold rates
  const goldRates = [
    { purity: GoldPurity.K24, ratePerGm: 7500.00 },
    { purity: GoldPurity.K22, ratePerGm: 6875.00 },
    { purity: GoldPurity.K18, ratePerGm: 5625.00 },
    { purity: GoldPurity.K14, ratePerGm: 4375.00 },
  ];

  for (const rate of goldRates) {
    const existing = await prisma.goldRate.findFirst({
      where: { purity: rate.purity },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!existing) {
      await prisma.goldRate.create({
        data: {
          purity: rate.purity,
          ratePerGm: rate.ratePerGm,
          setBy: admin.id,
        },
      });
    }
  }
  console.log(`Seeded ${goldRates.length} gold rates`);

  // ─── Seed sample vendors ────────────────────────────────────────

  const vendors = [
    { code: 'VND-001', name: 'Rajesh Gold Suppliers', phone: '9876543210', contactPerson: 'Rajesh Kumar', gstin: '27AABCU9603R1ZM', address: 'Zaveri Bazaar, Mumbai' },
    { code: 'VND-002', name: 'Sharma Jewellers Wholesale', phone: '9876543211', contactPerson: 'Anil Sharma', gstin: '07AAACS1234L1Z5', address: 'Chandni Chowk, Delhi' },
    { code: 'VND-003', name: 'South Gold Traders', phone: '9876543212', contactPerson: 'Venkat Raman', gstin: '33AADCS5678M1ZP', address: 'T Nagar, Chennai' },
  ];

  const vendorRecords = [];
  for (const v of vendors) {
    const vendor = await prisma.vendor.upsert({
      where: { code: v.code },
      update: {},
      create: v,
    });
    vendorRecords.push(vendor);
  }
  console.log(`Seeded ${vendors.length} vendors`);

  // ─── Seed sample customer ───────────────────────────────────────

  await prisma.customer.upsert({
    where: { phone: '9898989898' },
    update: {},
    create: {
      name: 'Priya Patel',
      phone: '9898989898',
      email: 'priya@example.com',
      address: '123 MG Road, Ahmedabad',
      stateCode: '24',
    },
  });
  await prisma.customer.upsert({
    where: { phone: '9797979797' },
    update: {},
    create: {
      name: 'Amit Mehta',
      phone: '9797979797',
      email: 'amit.mehta@example.com',
      address: '45 Park Street, Kolkata',
      stateCode: '19',
    },
  });
  console.log('Seeded 2 sample customers');

  // ─── Seed sample products ──────────────────────────────────────

  // Look up category IDs
  const catMap: Record<string, string> = {};
  const allCats = await prisma.category.findMany();
  for (const c of allCats) catMap[c.code] = c.id;

  const sampleProducts = [
    // Rings
    { sku: 'RNG-2605-0001', name: 'Classic Gold Band Ring', categoryCode: 'RNG', grossWeight: 5.200, stoneWeight: 0, goldPurity: GoldPurity.K22, wastagePct: 8, makingChargesPct: 12, purchasePrice: 38500, reorderLevel: 3, vendorIdx: 0, initialStock: 10 },
    { sku: 'RNG-2605-0002', name: 'Diamond Solitaire Ring', categoryCode: 'RNG', grossWeight: 4.800, stoneWeight: 0.350, goldPurity: GoldPurity.K18, wastagePct: 6, makingChargesPct: 15, stoneRatePerCt: 45000, purchasePrice: 72000, reorderLevel: 2, vendorIdx: 1, initialStock: 5 },
    // Bangles
    { sku: 'BNG-2605-0001', name: 'Traditional Kada Bangle (Single)', categoryCode: 'BNG', grossWeight: 18.500, stoneWeight: 0, goldPurity: GoldPurity.K22, wastagePct: 5, makingChargesPct: 8, purchasePrice: 135000, reorderLevel: 2, vendorIdx: 0, initialStock: 6 },
    { sku: 'BNG-2605-0002', name: 'Stone-studded Bangle Set (Pair)', categoryCode: 'BNG', grossWeight: 24.000, stoneWeight: 1.200, goldPurity: GoldPurity.K22, wastagePct: 6, makingChargesPct: 10, stoneRatePerCt: 2500, purchasePrice: 180000, reorderLevel: 2, vendorIdx: 2, initialStock: 4 },
    // Necklaces
    { sku: 'NKL-2605-0001', name: 'Bridal Temple Necklace', categoryCode: 'NKL', grossWeight: 35.000, stoneWeight: 2.500, goldPurity: GoldPurity.K22, wastagePct: 7, makingChargesPct: 14, stoneRatePerCt: 3000, purchasePrice: 275000, reorderLevel: 1, vendorIdx: 2, initialStock: 3 },
    { sku: 'NKL-2605-0002', name: 'Light Weight Daily Wear Chain', categoryCode: 'NKL', grossWeight: 8.000, stoneWeight: 0, goldPurity: GoldPurity.K22, wastagePct: 4, makingChargesPct: 6, purchasePrice: 58000, reorderLevel: 5, vendorIdx: 0, initialStock: 12 },
    // Earrings
    { sku: 'ERG-2605-0001', name: 'Gold Jhumka Earrings', categoryCode: 'ERG', grossWeight: 12.500, stoneWeight: 0.800, goldPurity: GoldPurity.K22, wastagePct: 6, makingChargesPct: 12, stoneRatePerCt: 1800, purchasePrice: 95000, reorderLevel: 3, vendorIdx: 1, initialStock: 8 },
    { sku: 'ERG-2605-0002', name: '18K Diamond Studs', categoryCode: 'ERG', grossWeight: 3.200, stoneWeight: 0.600, goldPurity: GoldPurity.K18, wastagePct: 5, makingChargesPct: 18, stoneRatePerCt: 55000, purchasePrice: 85000, reorderLevel: 2, vendorIdx: 1, initialStock: 6 },
    // Pendants
    { sku: 'PND-2605-0001', name: 'Om Pendant (22K)', categoryCode: 'PND', grossWeight: 3.500, stoneWeight: 0, goldPurity: GoldPurity.K22, wastagePct: 5, makingChargesPct: 10, purchasePrice: 26000, reorderLevel: 5, vendorIdx: 0, initialStock: 15 },
    // Chains
    { sku: 'CHN-2605-0001', name: 'Bismark Gold Chain 20"', categoryCode: 'CHN', grossWeight: 15.000, stoneWeight: 0, goldPurity: GoldPurity.K22, wastagePct: 3, makingChargesPct: 5, purchasePrice: 108000, reorderLevel: 3, vendorIdx: 0, initialStock: 8 },
    // Mangalsutra
    { sku: 'MGS-2605-0001', name: 'Gold & Black Beads Mangalsutra', categoryCode: 'MGS', grossWeight: 10.000, stoneWeight: 0.300, goldPurity: GoldPurity.K22, wastagePct: 5, makingChargesPct: 10, stoneRatePerCt: 2000, purchasePrice: 75000, reorderLevel: 3, vendorIdx: 2, initialStock: 7 },
    // Nose Pin
    { sku: 'NSP-2605-0001', name: 'Diamond Nose Pin', categoryCode: 'NSP', grossWeight: 0.800, stoneWeight: 0.150, goldPurity: GoldPurity.K18, wastagePct: 4, makingChargesPct: 20, stoneRatePerCt: 60000, purchasePrice: 18000, reorderLevel: 5, vendorIdx: 1, initialStock: 20 },
  ];

  let productCount = 0;
  for (const sp of sampleProducts) {
    const exists = await prisma.product.findUnique({ where: { sku: sp.sku } });
    if (exists) continue;

    const netWeight = sp.grossWeight - sp.stoneWeight;

    const product = await prisma.product.create({
      data: {
        sku: sp.sku,
        name: sp.name,
        categoryId: catMap[sp.categoryCode],
        grossWeight: sp.grossWeight,
        netWeight,
        stoneWeight: sp.stoneWeight,
        goldPurity: sp.goldPurity,
        wastagePct: sp.wastagePct,
        makingChargesPct: sp.makingChargesPct,
        stoneRatePerCt: sp.stoneRatePerCt ?? null,
        purchasePrice: sp.purchasePrice,
        currentStock: sp.initialStock,
        reorderLevel: sp.reorderLevel,
        vendorId: vendorRecords[sp.vendorIdx].id,
        createdById: admin.id,
      },
    });

    // Create OPENING stock movement
    if (sp.initialStock > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          type: 'OPENING',
          quantityDelta: sp.initialStock,
          stockAfter: sp.initialStock,
          createdById: admin.id,
          notes: 'Seeded initial stock',
        },
      });
    }

    productCount++;
  }
  console.log(`Seeded ${productCount} sample products`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
