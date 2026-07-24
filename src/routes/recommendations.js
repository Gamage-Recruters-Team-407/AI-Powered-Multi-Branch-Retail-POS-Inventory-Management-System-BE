const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');

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
