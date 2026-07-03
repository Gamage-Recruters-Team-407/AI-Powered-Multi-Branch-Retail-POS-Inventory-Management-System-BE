const assert = require('node:assert/strict');
const test = require('node:test');

const app = require('../app');

const request = async (server, path, options) => {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, options);
  const body = await response.json();

  return { body, status: response.status };
};

test('health endpoint returns ok', async () => {
  const server = app.listen(0);

  try {
    const response = await request(server, '/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
  } finally {
    server.close();
  }
});

test('purchase order list is available before MongoDB connects', async () => {
  const server = app.listen(0);

  try {
    const response = await request(server, '/api/purchase-orders');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, []);
  } finally {
    server.close();
  }
});

test('purchase order writes explain missing MongoDB connection', async () => {
  const server = app.listen(0);

  try {
    const response = await request(server, '/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier: 'BlueLine Wholesale',
        branch: 'Colombo Central',
        date: '2026-06-03',
        amount: '12500',
      }),
    });

    assert.equal(response.status, 503);
    assert.match(response.body.message, /MongoDB is not connected/);
  } finally {
    server.close();
  }
});