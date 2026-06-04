// Dummy data for suggestions since we don't have a complex ML model here for decisions yet.
// In a real scenario, this would query the DB for low stock or analyze trends.

const getPendingSuggestions = async () => {
  return [
    {
      id: "action_001",
      type: "LOW_STOCK",
      urgency: "critical",
      productId: "prod_003",
      productName: "Laptop Stand",
      currentStock: 3,
      reorderLevel: 10,
      suggestedQuantity: 50,
      action: "create_po"
    },
    {
      id: "action_002",
      type: "TRENDING",
      productId: "prod_041",
      productName: "USB Flash Drive",
      growth: 466.7,
      suggestion: "Increase inventory by 50%",
      action: "reorder"
    }
  ];
};

const createPurchaseOrder = async (productId, quantity, supplierId) => {
  // Mock DB logic to create PO
  return {
    success: true,
    message: "Purchase order created successfully",
    poId: `PO-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    status: "PENDING"
  };
};

const sendOffer = async (customerId, offerDetails) => {
  return {
    success: true,
    message: "Offer sent successfully to customer",
    status: "SENT"
  };
};

const triggerReorder = async (productId, quantity) => {
  return {
    success: true,
    message: "Reorder triggered successfully",
    status: "PROCESSING"
  };
};

const approveAllPending = async () => {
  return {
    success: true,
    message: "All pending actions approved",
    count: 2
  };
};

module.exports = {
  getPendingSuggestions,
  createPurchaseOrder,
  sendOffer,
  triggerReorder,
  approveAllPending
};
