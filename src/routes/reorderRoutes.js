const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getReorderRecommendations,
    approveReorderRecommendation
} = require('../controllers/reorderController');

// GET /api/reorders/suggestions?branchId=&limit=&days=&includeAll=true
router.get(
    '/suggestions',
    protect,
    authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
    getReorderRecommendations
);

// POST /api/reorders/suggestions/:id/approve
router.post(
    '/suggestions/:id/approve',
    protect,
    authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
    approveReorderRecommendation
);

module.exports = router;
