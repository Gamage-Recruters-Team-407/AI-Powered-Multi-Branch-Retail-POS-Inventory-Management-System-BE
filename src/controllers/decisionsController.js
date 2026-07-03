const decisionService = require('../services/decisionService');

exports.getSuggestions = async (req, res) => {
  try {
    const suggestions = await decisionService.getPendingSuggestions();
    res.json({ success: true, data: suggestions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  try {
    const { productId, quantity, supplierId } = req.body;
    if (!productId || !quantity) {
      return res.status(400).json({ success: false, message: 'productId and quantity are required' });
    }
    const result = await decisionService.createPurchaseOrder(productId, quantity, supplierId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.sendOffer = async (req, res) => {
  try {
    const { customerId, offerDetails } = req.body;
    const result = await decisionService.sendOffer(customerId, offerDetails);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.reorder = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const result = await decisionService.triggerReorder(productId, quantity);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.approveAll = async (req, res) => {
  try {
    const result = await decisionService.approveAllPending();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
