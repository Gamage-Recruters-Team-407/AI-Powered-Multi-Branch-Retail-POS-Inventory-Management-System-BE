/**
 * Quick smoke test: app loads and core routes respond.
 * Usage: npm run verify
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const http = require('http');
const app = require('../src/app');

const routes = [
  { method: 'GET', path: '/api/health', expect: [200] },
  { method: 'GET', path: '/', expect: [200] },
  { method: 'GET', path: '/api/branches', expect: [200] },
  { method: 'GET', path: '/api/products', expect: [200] },
  { method: 'GET', path: '/api/promotions', expect: [200, 503] },
  { method: 'GET', path: '/api/suppliers', expect: [200] },
  { method: 'GET', path: '/api/recommendations/sales/top-products', expect: [200, 503] },
  { method: 'GET', path: '/api/stock-transfers/permissions', expect: [401, 403, 503] },
];

const request = (server, method, path) =>
  new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { Accept: 'application/json' },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });

async function main() {
  console.log('Verifying backend modules and routes...\n');

  const server = app.listen(0);
  let failed = 0;

  try {
    for (const route of routes) {
      try {
        const { status } = await request(server, route.method, route.path);
        const ok = route.expect.includes(status);
        const mark = ok ? 'OK' : 'FAIL';
        console.log(`  [${mark}] ${route.method} ${route.path} → ${status}`);
        if (!ok) failed += 1;
      } catch (err) {
        console.log(`  [FAIL] ${route.method} ${route.path} → ${err.message}`);
        failed += 1;
      }
    }

    const mongo = process.env.MONGO_URI ? 'set' : 'missing';
    console.log(`\n  MONGO_URI: ${mongo}`);
    console.log(`  PORT (env): ${process.env.PORT || '5001 (default)'}`);

    if (failed) {
      console.log(`\n${failed} route check(s) failed.`);
      process.exit(1);
    }
    console.log('\nAll smoke checks passed. Run `npm run dev` and `npm run seed:transfer-test` for full data.');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
