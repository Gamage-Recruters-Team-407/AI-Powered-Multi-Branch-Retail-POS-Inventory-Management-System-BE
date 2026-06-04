const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Customer = require('../models/Customer');
const systemEvents = require('../events/eventBus');

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5001';

// 1. Load JSON File (Fallback Data)
const dataPath = path.join(__dirname, '../data/recommendations.json');
let fallbackData = {};

const loadRecommendations = () => {
    try {
        const rawData = fs.readFileSync(dataPath, 'utf8');
        fallbackData = JSON.parse(rawData);
        console.log("✅ Fallback recommendation data loaded successfully");
        return true;
    } catch (error) {
        console.error("❌ Failed to load recommendations.json:", error.message);
        return false;
    }
};

// Initial load on startup
loadRecommendations();

// Helper to format success response
const formatResponse = (data, source) => ({
    success: true,
    data,
    source
});

// Helper to handle limits
const applyLimit = (array, limit) => {
    if (!array) return [];
    const limitNum = parseInt(limit) || 10;
    return array.slice(0, limitNum);
};

// Core Fallback Wrapper
const fetchWithFallback = async (endpoint, query, fallbackKey, transformFallback = null) => {
    try {
        // Try ML API first with 2000ms timeout
        const params = new URLSearchParams(query || {}).toString();
        const url = `${FLASK_API_URL}${endpoint}${params ? '?' + params : ''}`;
        
        const response = await axios.get(url, { timeout: 2000 });
        
        return formatResponse(response.data, "flask-ml");
    } catch (error) {
        // Fallback to JSON
        console.warn(`⚠️ Flask ML API unavailable (${error.message}). Using fallback data for ${endpoint}`);
        
        try {
            let data = fallbackData[fallbackKey] || [];
            if (transformFallback) {
                data = transformFallback(data);
            } else {
                data = applyLimit(data, query?.limit);
            }
            return formatResponse(data, "fallback-json");
        } catch (fbError) {
            throw new Error(`Both ML API and Fallback failed: ${fbError.message}`);
        }
    }
};

// 1. GET /api/recommendations/sales/top-products
router.get('/sales/top-products', async (req, res) => {
    try {
        const result = await fetchWithFallback(
            '/predict/sales/top-products', 
            req.query, 
            'salesRecommendations'
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. GET /api/recommendations/inventory/low-stock
router.get('/inventory/low-stock', async (req, res) => {
    try {
        const result = await fetchWithFallback(
            '/predict/inventory/low-stock', 
            req.query, 
            'inventoryRecommendations'
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. GET /api/recommendations/cross-sell/:productId
router.get('/cross-sell/:productId', async (req, res) => {
    try {
        const productId = req.params.productId;
        const result = await fetchWithFallback(
            `/predict/cross-sell/${productId}`, 
            req.query, 
            'crossSellRecommendations',
            (allCrossSell) => {
                const filtered = allCrossSell.filter(item => item.product1Id === productId || item.product2Id === productId);
                return applyLimit(filtered, req.query.limit);
            }
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. GET /api/recommendations/personalized/:customerId
router.get('/personalized/:customerId', async (req, res) => {
    try {
        const rawCustomerId = req.params.customerId;
        
        // ML Model only knows about cust_001 to cust_010 (training data)
        // So we map the real MongoDB ObjectId to a training ID deterministically
        let mappedId = rawCustomerId;
        if (rawCustomerId.length === 24) { 
            const lastChar = rawCustomerId.slice(-1);
            const num = (parseInt(lastChar, 16) % 10) + 1; // 1 to 10
            mappedId = `cust_${num.toString().padStart(3, '0')}`;
        }

        const result = await fetchWithFallback(
            `/predict/personalized/${mappedId}`, 
            req.query, 
            'personalizedRecommendations',
            (allPersonalized) => {
                const customerData = allPersonalized.find(item => item.customerId === mappedId);
                const recommendations = customerData ? customerData.recommendations : [];
                return applyLimit(recommendations, req.query.limit);
            }
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. GET /api/recommendations/trending/products
router.get('/trending/products', async (req, res) => {
    try {
        const result = await fetchWithFallback(
            '/predict/trending', 
            req.query, 
            'trendingProducts'
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. GET /api/recommendations/customers/behavior
router.get('/customers/behavior', async (req, res) => {
    try {
        // Fetch real LIVE customers from MongoDB
        const customers = await Customer.find({}).sort({ createdAt: -1 }).limit(15);
        
        if (!customers || customers.length === 0) {
            // Fallback if no real customers exist yet
            return res.json({
                success: true,
                source: "empty-mongodb",
                data: [{ customerId: "cust_001", customerName: "No Live Customers Found" }]
            });
        }

        const data = customers.map(c => ({
            customerId: c._id.toString(),
            customerName: (c.firstName + ' ' + (c.lastName || '')).trim()
        }));

        res.json({
            success: true,
            data: data,
            source: "mongodb-live"
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. GET /api/recommendations/analytics/insights
router.get('/analytics/insights', async (req, res) => {
    try {
        const result = await fetchWithFallback(
            '/predict/analytics', 
            req.query, 
            'conversationalAnalytics',
            (data) => data // No limit applied to analytics object
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8. POST /api/recommendations/refresh
router.post('/refresh', (req, res) => {
    try {
        const success = loadRecommendations();
        if (success) {
            // Alert Managers
            systemEvents.emit('SEND_ALERT', {
                target: { role: 'Manager' }, 
                category: 'SYSTEM',
                type: 'INFO',
                title: 'AI Recommendations Updated',
                message: 'The AI Recommendation Engine has been retrained with new sales and inventory data.',
                channels: ['in-app']
            });

            // Alert Admins
            systemEvents.emit('SEND_ALERT', {
                target: { role: 'Admin' }, 
                category: 'SYSTEM',
                type: 'INFO',
                title: 'AI Recommendations Updated',
                message: 'The AI Recommendation Engine has been retrained with new sales and inventory data.',
                channels: ['in-app']
            });

            res.json({
                success: true,
                message: "Recommendation engine retrained and reloaded successfully",
                stats: {
                    salesRecs: fallbackData.salesRecommendations?.length || 0,
                    inventoryRecs: fallbackData.inventoryRecommendations?.length || 0,
                    crossSellPairs: fallbackData.crossSellRecommendations?.length || 0
                }
            });
        } else {
            res.status(500).json({ success: false, error: "Failed to reload recommendations data" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
