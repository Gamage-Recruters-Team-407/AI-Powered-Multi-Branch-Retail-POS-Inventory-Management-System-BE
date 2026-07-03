/**
 * Seeds branches, product, inventory, users, and a PENDING stock transfer
 * so manager → admin workflow can be tested in the UI.
 *
 * Usage: npm run seed:transfer-test
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Branch = require('../src/models/Branch');
const Product = require('../src/models/Product');
const Inventory = require('../src/models/Inventory');
const User = require('../src/models/User');
const StockTransfer = require('../src/models/StockTransfer');

const MANAGER_EMAIL = process.env.SEED_MANAGER_EMAIL || 'manager@test.com';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@test.com';
const DEFAULT_PASSWORD = process.env.SEED_USER_PASSWORD || 'Password123!';

async function upsertBranch({ code, name, city }) {
  let branch = await Branch.findOne({ code });
  if (!branch) {
    branch = await Branch.create({
      code,
      name,
      city,
      address: `${name} address`,
      contactNumber: '555-0100',
      isActive: true,
    });
    console.log(`  + Branch: ${name} (${branch._id})`);
  } else {
    console.log(`  = Branch exists: ${name}`);
  }
  return branch;
}

async function upsertUser({ email, role, firstName, lastName, branchId }) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      password: DEFAULT_PASSWORD,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      role,
      branch: branchId || undefined,
      isActive: true,
    });
    console.log(`  + User: ${email} (${role})`);
  } else {
    console.log(`  = User exists: ${email} (${user.role})`);
  }
  return user;
}

async function main() {
  const conn = await connectDB();
  if (!conn) {
    console.error('Cannot seed: MONGO_URI missing or connection failed.');
    process.exit(1);
  }

  console.log('\n--- Stock transfer test seed ---\n');

  const branchA = await upsertBranch({ code: 'BR-A', name: 'Branch Alpha', city: 'Colombo' });
  const branchB = await upsertBranch({ code: 'BR-B', name: 'Branch Beta', city: 'Kandy' });

  let product = await Product.findOne({ barcode: 'SEED-ST-001' });
  if (!product) {
    product = await Product.create({
      name: 'Seed Transfer Product',
      barcode: 'SEED-ST-001',
      sku: 'SEED-ST-001',
      price: 49.99,
      costPrice: 20,
      brand: 'Seed',
      description: 'Product for stock transfer testing',
    });
    console.log(`  + Product: ${product.name}`);
  } else {
    console.log(`  = Product exists: ${product.name}`);
  }

  const stockQty = 100;
  let inv = await Inventory.findOne({ branch: branchA._id, product: product._id });
  if (!inv) {
    inv = await Inventory.create({
      branch: branchA._id,
      product: product._id,
      quantity: stockQty,
      reservedStock: 0,
      lowStockAlert: false,
    });
    console.log(`  + Inventory at ${branchA.name}: ${stockQty} units`);
  } else if (inv.quantity < 10) {
    inv.quantity = stockQty;
    await inv.save();
    console.log(`  ~ Inventory restocked at ${branchA.name}: ${stockQty} units`);
  } else {
    console.log(`  = Inventory OK at ${branchA.name}: ${inv.quantity} units`);
  }

  const manager = await upsertUser({
    email: MANAGER_EMAIL,
    role: 'MANAGER',
    firstName: 'Test',
    lastName: 'Manager',
    branchId: branchA._id,
  });

  await upsertUser({
    email: ADMIN_EMAIL,
    role: 'ADMIN',
    firstName: 'Test',
    lastName: 'Admin',
  });

  const existingPending = await StockTransfer.findOne({
    status: 'PENDING',
    fromBranch: branchA._id,
    toBranch: branchB._id,
  });

  if (!existingPending) {
    const transfer = await StockTransfer.create({
      fromBranch: branchA._id,
      toBranch: branchB._id,
      items: [{ product: product._id, quantity: 5 }],
      status: 'PENDING',
      notes: 'Seeded pending transfer for admin approval test',
      createdBy: manager._id,
      activityLogs: [
        {
          status: 'PENDING',
          note: 'Transfer created (seed)',
          changedBy: manager._id,
        },
      ],
    });
    console.log(`  + PENDING transfer: ${transfer._id}`);
  } else {
    console.log(`  = PENDING transfer already exists: ${existingPending._id}`);
  }

  const pendingCount = await StockTransfer.countDocuments({ status: 'PENDING' });
  console.log(`\nTotal PENDING transfers in DB: ${pendingCount}`);
  console.log('\nTest logins (password for both):', DEFAULT_PASSWORD);
  console.log(`  Manager → ${MANAGER_EMAIL}`);
  console.log(`  Admin   → ${ADMIN_EMAIL}`);
  console.log('\nAPI: POST /api/stock-transfers (MANAGER token)');
  console.log('     GET  /api/stock-transfers (ADMIN sees all pending)\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
