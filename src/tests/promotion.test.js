const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = require('../app');
const Promotion = require('../models/Promotion');

const request = async (server, path, options) => {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, options);
  const body = await response.json();
  return { body, status: response.status };
};

// 1. SCHEMA VALIDATION TESTS
test('Promotion Schema validation succeeds with valid details', () => {
  const promotion = new Promotion({
    title: 'New Year Sale',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    couponCode: 'NEWYEAR2026',
    minPurchaseAmount: 1000,
    usageLimit: 100,
    usageCount: 0,
    isActive: true
  });

  const err = promotion.validateSync();
  assert.equal(err, undefined);
  assert.equal(promotion.discountType, 'PERCENTAGE');
  assert.equal(promotion.minPurchaseAmount, 1000);
});

// 2. HTTP OFFLINE ENDPOINT TESTS
test('HTTP Endpoints return 503 when MongoDB is offline', async () => {
  const server = app.listen(0);
  const dummyId = new mongoose.Types.ObjectId().toString();

  try {
    // GET /api/promotions
    let res = await request(server, '/api/promotions');
    assert.equal(res.status, 503);

    // POST /api/promotions
    res = await request(server, '/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test' })
    });
    assert.equal(res.status, 503);

    // POST /api/promotions/validate
    res = await request(server, '/api/promotions/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couponCode: 'NEWYEAR2026', cartTotal: 5000 })
    });
    assert.equal(res.status, 503);

    // GET /api/promotions/:id
    res = await request(server, `/api/promotions/${dummyId}`);
    assert.equal(res.status, 503);

    // PUT /api/promotions/:id
    res = await request(server, `/api/promotions/${dummyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' })
    });
    assert.equal(res.status, 503);

    // DELETE /api/promotions/:id
    res = await request(server, `/api/promotions/${dummyId}`, {
      method: 'DELETE'
    });
    assert.equal(res.status, 503);
  } finally {
    server.close();
  }
});

// 3. INTEGRATION TESTS (WITH MONGO CONNECTION)
test('Promotion CRUD and Validation Integration Tests', async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.log('Skipping integration tests: MONGO_URI not set');
    return;
  }

  // Connect to the DB
  await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME || 'retail_pos_db' });

  const server = app.listen(0);
  let testPromotionId;

  try {
    // A. Clean up previous test promotions just in case
    await Promotion.deleteMany({ couponCode: { $in: ['TEST_PROMO_1', 'TEST_PROMO_2'] } });

    // B. Create a promotion (POST /api/promotions)
    const createRes = await request(server, '/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Integration Test Promo',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        startDate: new Date(Date.now() - 3600000), // started 1 hour ago
        endDate: new Date(Date.now() + 3600000), // ends in 1 hour
        couponCode: 'TEST_PROMO_1',
        minPurchaseAmount: 1000,
        usageLimit: 10,
        usageCount: 0,
        isActive: true
      })
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body._id);
    testPromotionId = createRes.body._id;

    // C. Get all promotions (GET /api/promotions)
    const listRes = await request(server, '/api/promotions');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));
    assert.ok(listRes.body.some(p => p.couponCode === 'TEST_PROMO_1'));

    // D. Get single promotion by ID (GET /api/promotions/:id)
    const getRes = await request(server, `/api/promotions/${testPromotionId}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.couponCode, 'TEST_PROMO_1');

    // E. Test Invalid ObjectId validation
    const invalidIdRes = await request(server, '/api/promotions/invalid-id-123');
    assert.equal(invalidIdRes.status, 400);

    // F. Validate Coupon Code (POST /api/promotions/validate)
    // Case 1: Valid Coupon code
    const validPromoRes = await request(server, '/api/promotions/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couponCode: 'TEST_PROMO_1',
        cartTotal: 2000
      })
    });
    assert.equal(validPromoRes.status, 200);
    assert.equal(validPromoRes.body.valid, true);
    assert.equal(validPromoRes.body.discountType, 'PERCENTAGE');
    assert.equal(validPromoRes.body.discountAmount, 300); // 15% of 2000

    // Case 2: Cart Total below minimum purchase
    const invalidMinAmountRes = await request(server, '/api/promotions/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couponCode: 'TEST_PROMO_1',
        cartTotal: 500
      })
    });
    assert.equal(invalidMinAmountRes.status, 200);
    assert.equal(invalidMinAmountRes.body.valid, false);
    assert.match(invalidMinAmountRes.body.message, /Minimum purchase amount/);

    // G. Update Promotion (PUT /api/promotions/:id)
    const updateRes = await request(server, `/api/promotions/${testPromotionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discountValue: 20 // Update percentage to 20%
      })
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.discountValue, 20);

    // Re-validate coupon to verify updated discount
    const revalidateRes = await request(server, '/api/promotions/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couponCode: 'TEST_PROMO_1',
        cartTotal: 2000
      })
    });
    assert.equal(revalidateRes.status, 200);
    assert.equal(revalidateRes.body.valid, true);
    assert.equal(revalidateRes.body.discountAmount, 400); // 20% of 2000 now

    // H. Delete Promotion (DELETE /api/promotions/:id)
    const deleteRes = await request(server, `/api/promotions/${testPromotionId}`, {
      method: 'DELETE'
    });
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.message, 'Promotion deleted successfully');

    // Confirm it is deleted
    const getDeletedRes = await request(server, `/api/promotions/${testPromotionId}`);
    assert.equal(getDeletedRes.status, 404);

  } finally {
    // Clean up
    if (testPromotionId) {
      await Promotion.findByIdAndDelete(testPromotionId);
    }
    server.close();
    await mongoose.connection.close();
  }
});
