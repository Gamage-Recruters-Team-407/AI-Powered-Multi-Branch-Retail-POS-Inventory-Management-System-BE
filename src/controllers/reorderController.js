const reorderService = require('../services/reorderService');

const getReorderRecommendations = async (req, res, next) => {
    try {
        const { branchId, limit, days, includeAll } = req.query;

        const recommendations = await reorderService.generateReorderRecommendations({
            branchId,
            limit: Number(limit) || 20,
            days: Number(days) || 30,
            includeAll: includeAll === 'true'
        });

        res.status(200).json({
            success: true,
            count: recommendations.length,
            data: recommendations
        });
    } catch (error) {
        next(error);
    }
};

const approveReorderRecommendation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: user information is required to approve recommendations.'
            });
        }

        const result = await reorderService.approveReorderRecommendation(id, userId);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getReorderRecommendations,
    approveReorderRecommendation
};
