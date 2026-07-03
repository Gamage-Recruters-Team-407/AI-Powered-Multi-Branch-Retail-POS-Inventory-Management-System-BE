const intents = [
  {
    intent: 'CREATE_PO',
    keywords: ['create po', 'create a po', 'purchase order', 'buy', 'order stock'],
    apiEndpoint: null,
    params: {}
  },
  {
    intent: 'SEND_OFFER',
    keywords: ['send offer', 'send discount', 'promo', 'promotion'],
    apiEndpoint: null,
    params: {}
  },
  {
    intent: 'UPDATE_PRICE',
    keywords: ['update price', 'drop price', 'discount', 'lower price'],
    apiEndpoint: null,
    params: {}
  },
  {
    intent: 'LIQUIDATE',
    keywords: ['liquidate', 'clearance', 'dead stock'],
    apiEndpoint: null,
    params: {}
  },
  {
    intent: 'SALES',
    keywords: ['best seller', 'popular', 'top product', 'top selling', 'best selling'],
    apiEndpoint: '/predict/sales/top-products',
    params: { limit: 10 }
  },
  {
    intent: 'INVENTORY',
    keywords: ['low stock', 'reorder', 'inventory', 'stock', 'out of stock'],
    apiEndpoint: '/predict/inventory/low-stock',
    params: {}
  },
  {
    intent: 'CROSS_SELL',
    keywords: ['bought together', 'goes with', 'also bought', 'frequently bought'],
    apiEndpoint: '/predict/cross-sell/', // Requires productId to be appended
    params: {}
  },
  {
    intent: 'PERSONALIZED',
    keywords: ['recommend for me', 'personalized', 'suggest for', 'recommendation for'],
    apiEndpoint: '/predict/personalized/', // Requires customerId to be appended
    params: { limit: 8 }
  },
  {
    intent: 'TRENDING',
    keywords: ['trending', 'growing', 'hot', 'viral'],
    apiEndpoint: '/predict/trending',
    params: { limit: 10 }
  },
  {
    intent: 'CUSTOMER',
    keywords: ['customer', 'buyer', 'purchase behavior', 'behavior'],
    apiEndpoint: '/predict/customers/behavior',
    params: {}
  },
  {
    intent: 'ANALYTICS',
    keywords: ['revenue', 'sales', 'kpi', 'insight', 'stats', 'performance'],
    apiEndpoint: '/predict/analytics',
    params: {}
  }
];

/**
 * Detect the intent of a user's question and map it to an API.
 * @param {string} message - The user's message
 * @param {string} customerId - Optional customer ID for personalized intents
 * @returns {object} The detected intent and endpoint details
 */
const detectIntent = (message, customerId = null) => {
  const lowerMessage = message.toLowerCase();
  
  for (const intentObj of intents) {
    for (const keyword of intentObj.keywords) {
      if (lowerMessage.includes(keyword)) {
        
        let finalEndpoint = intentObj.apiEndpoint;
        
        // Append IDs if necessary
        if (intentObj.intent === 'PERSONALIZED' && customerId) {
          finalEndpoint += customerId;
        } else if (intentObj.intent === 'CROSS_SELL') {
          // If we had a product extraction, we would append it here. 
          // For now, defaulting or leaving as is.
          finalEndpoint += 'default_product_id';
        }

        return {
          intent: intentObj.intent,
          confidence: 0.95,
          apiEndpoint: finalEndpoint,
          params: intentObj.params
        };
      }
    }
  }

  // Fallback intent if no keywords match
  return {
    intent: 'GENERAL_CHAT',
    confidence: 0.5,
    apiEndpoint: null,
    params: {}
  };
};

module.exports = {
  detectIntent
};
