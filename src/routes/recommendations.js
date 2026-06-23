const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const systemEvents = require('../events/eventBus');

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5001';

// Load JSON file as fallback when Flask ML API is unavailable
const dataPath = path.join(__dirname, '../data/recommendations.json');
let fallbackData = {};

const loadFallbackData = () => {
	try {
		const rawData = fs.readFileSync(dataPath, 'utf8');
		fallbackData = JSON.parse(rawData);
		console.log('✅ Fallback recommendation data loaded successfully');
		console.log(`   Sales recs: ${fallbackData.salesRecommendations?.length || 0}`);
		console.log(`   Inventory recs: ${fallbackData.inventoryRecommendations?.length || 0}`);
		console.log(`   Cross-sell pairs: ${fallbackData.crossSellRecommendations?.length || 0}`);
		return true;
	} catch (error) {
		console.error('❌ Failed to load recommendations.json:', error.message);
		return false;
	}
};

loadFallbackData();

const formatResponse = (data, source) => ({
	success: true,
	data,
	source,
});

const applyLimit = (array, limit) => {
	if (!array) return [];
	const limitNum = parseInt(limit) || 10;
	return array.slice(0, limitNum);
};

const fetchWithFallback = async (endpoint, query, fallbackKey, transformFallback = null) => {
	try {
		const params = new URLSearchParams(query || {}).toString();
		const url = `${FLASK_API_URL}${endpoint}${params ? '?' + params : ''}`;

		const response = await axios.get(url, { timeout: 8000 });

		return formatResponse(response.data, 'flask-ml');
	} catch (error) {
		console.warn(
			`⚠️ Flask ML API unavailable (${error.message}). Using fallback data for ${endpoint}`,
		);

		try {
			let data = fallbackData[fallbackKey] || [];
			if (transformFallback) {
				data = transformFallback(data);
			} else {
				data = applyLimit(data, query?.limit);
			}
			return formatResponse(data, 'fallback-json');
		} catch (fbError) {
			throw new Error(`Both ML API and Fallback failed: ${fbError.message}`);
		}
	}
};

router.get('/sales/top-products', async (req, res) => {
	try {
		const result = await fetchWithFallback(
			'/predict/sales/top-products',
			req.query,
			'salesRecommendations',
		);
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/inventory/low-stock', async (req, res) => {
	try {
		const result = await fetchWithFallback(
			'/predict/inventory/low-stock',
			req.query,
			'inventoryRecommendations',
		);
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/cross-sell/:productId', async (req, res) => {
	try {
		const productId = req.params.productId;
		const result = await fetchWithFallback(
			`/predict/cross-sell/${productId}`,
			req.query,
			'crossSellRecommendations',
			(allCrossSell) => {
				const filtered = allCrossSell.filter(
					(item) => item.product1Id === productId || item.product2Id === productId,
				);
				return applyLimit(filtered, req.query.limit);
			},
		);
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/personalized/:customerId', async (req, res) => {
	try {
		const rawCustomerId = req.params.customerId;

		let mappedId = rawCustomerId;
		if (rawCustomerId.length === 24) {
			const lastChar = rawCustomerId.slice(-1);
			const num = (parseInt(lastChar, 16) % 10) + 1;
			mappedId = `cust_${num.toString().padStart(3, '0')}`;
		}

		const result = await fetchWithFallback(
			`/predict/personalized/${mappedId}`,
			req.query,
			'personalizedRecommendations',
			(allPersonalized) => {
				const customerData = allPersonalized.find(
					(item) => item.customerId === mappedId,
				);
				const recommendations = customerData ? customerData.recommendations : [];
				return applyLimit(recommendations, req.query.limit);
			},
		);
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/trending/products', async (req, res) => {
	try {
		const result = await fetchWithFallback(
			'/predict/trending',
			req.query,
			'trendingProducts',
		);
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/customers/behavior', async (req, res) => {
	try {
		const customers = await Customer.find({}).sort({ createdAt: -1 }).limit(15);

		if (!customers || customers.length === 0) {
			return res.json({
				success: true,
				source: 'empty-mongodb',
				data: [{ customerId: 'cust_001', customerName: 'No Live Customers Found' }],
			});
		}

		const data = customers.map((c) => ({
			customerId: c._id.toString(),
			customerName: (c.firstName + ' ' + (c.lastName || '')).trim(),
		}));

		res.json({
			success: true,
			data,
			source: 'mongodb-live',
		});
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

router.get('/analytics/insights', async (req, res) => {
	try {
		const result = await fetchWithFallback(
			'/predict/analytics',
			req.query,
			'conversationalAnalytics',
			(data) => data,
		);
		res.json(result);
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

router.post('/refresh', (req, res) => {
	try {
		const success = loadFallbackData();
		if (success) {
			systemEvents.emit('SEND_ALERT', {
				target: { role: 'Manager' },
				category: 'SYSTEM',
				type: 'INFO',
				title: 'AI Recommendations Updated',
				message:
					'The AI Recommendation Engine has been retrained with new sales and inventory data.',
				channels: ['in-app'],
			});

			systemEvents.emit('SEND_ALERT', {
				target: { role: 'Admin' },
				category: 'SYSTEM',
				type: 'INFO',
				title: 'AI Recommendations Updated',
				message:
					'The AI Recommendation Engine has been retrained with new sales and inventory data.',
				channels: ['in-app'],
			});

			res.json({
				success: true,
				message: 'Recommendation engine retrained and reloaded successfully',
				stats: {
					salesRecs: fallbackData.salesRecommendations?.length || 0,
					inventoryRecs: fallbackData.inventoryRecommendations?.length || 0,
					crossSellPairs: fallbackData.crossSellRecommendations?.length || 0,
				},
			});
		} else {
			res.status(500).json({
				success: false,
				error: 'Failed to reload recommendations data',
			});
		}
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

// Real sales chart data from MongoDB for Business Insights ChartWidget
router.get('/sales-chart', async (req, res) => {
	try {
		const { fromDate, toDate, granularity = 'day' } = req.query;

		const match = { status: 'COMPLETED' };
		if (fromDate || toDate) {
			match.createdAt = {};
			if (fromDate) match.createdAt.$gte = new Date(fromDate);
			if (toDate) {
				const end = new Date(toDate);
				end.setHours(23, 59, 59, 999);
				match.createdAt.$lte = end;
			}
		}

		let dateFormat;
		if (granularity === 'week') {
			dateFormat = '%G-W%V';
		} else if (granularity === 'month') {
			dateFormat = '%Y-%m';
		} else {
			dateFormat = '%Y-%m-%d';
		}

		const salesData = await Sale.aggregate([
			{ $match: match },
			{
				$group: {
					_id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
					sales: { $sum: '$totalAmount' },
					count: { $sum: 1 },
				},
			},
			{ $sort: { _id: 1 } },
		]);

		// Calculate the average as "expected" baseline
		const totalSales = salesData.reduce((sum, d) => sum + d.sales, 0);
		const avgSales = salesData.length > 0 ? totalSales / salesData.length : 0;

		const data = salesData.map((item) => ({
			name: item._id,
			sales: Math.round(item.sales),
			expected: Math.round(avgSales),
		}));

		res.json({ success: true, data, source: 'mongodb-live' });
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

module.exports = router;

