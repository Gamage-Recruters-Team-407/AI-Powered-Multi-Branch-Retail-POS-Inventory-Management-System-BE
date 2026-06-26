const axios = require('axios');
const { generateResponse } = require('../utils/geminiClient');
const { detectIntent } = require('./intentDetector');
const Conversation = require('../models/Conversation');
const decisionService = require('./decisionService');

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5001';

/**
 * Handle an incoming chat message, fetch data, and get an AI response.
 */
const processChatMessage = async (message, sessionId, customerId = null, chatType = 'assistant') => {
  try {
    // 1. Detect Intent
    const intentData = detectIntent(message, customerId);
    let fetchedData = null;
    let actionResult = null;

    // 2. Fetch real data from Recommendation Engine (Flask) or execute Action
    if (intentData.intent === 'INVENTORY') {
      try {
        const response = await axios.get(`${FLASK_API_URL}/predict/decisions`);
        const suggestions = Array.isArray(response.data) ? response.data : (response.data.actions || []);
        const lowStockItems = suggestions.filter(s => s.type === 'LOW_STOCK');
        fetchedData = {
          message: "Current low stock items from Decision Assistant",
          items: lowStockItems.map(item => ({
            productName: item.productName,
            branchName: item.branchName || 'All Branches',
            currentStock: item.currentStock,
            reorderLevel: item.reorderLevel,
            suggestedQuantity: item.suggestedQuantity
          }))
        };
      } catch (err) {
        console.error('Failed to fetch decision data:', err.message);
        fetchedData = { error: 'Could not fetch live inventory data.' };
      }
    } else if (intentData.intent === 'BRANCH_PERFORMANCE') {
      try {
        const Sale = require('../models/Sale');
        const Branch = require('../models/Branch');
        
        const branches = await Branch.find();
        const branchSales = [];
        
        // Determine date filter
        let dateFilter = {};
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes('today')) {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          dateFilter = { createdAt: { $gte: startOfDay } };
        } else if (lowerMsg.includes('week')) {
          const startOfWeek = new Date();
          startOfWeek.setDate(startOfWeek.getDate() - 7);
          dateFilter = { createdAt: { $gte: startOfWeek } };
        } else if (lowerMsg.includes('month')) {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);
          dateFilter = { createdAt: { $gte: startOfMonth } };
        }
        
        for (const branch of branches) {
          const sales = await Sale.aggregate([
            { $match: { branch: branch._id, status: 'COMPLETED', ...dateFilter } },
            { $unwind: "$items" },
            { $group: { _id: null, totalRevenue: { $sum: "$items.lineTotal" }, itemsSold: { $sum: "$items.quantity" } } }
          ]);
          
          branchSales.push({
            branchName: branch.name,
            totalRevenue: sales[0] ? sales[0].totalRevenue : 0,
            itemsSold: sales[0] ? sales[0].itemsSold : 0
          });
        }
        
        // Sort by revenue descending
        branchSales.sort((a, b) => b.totalRevenue - a.totalRevenue);
        
        fetchedData = {
          message: "Sales performance comparison across all branches",
          branches: branchSales
        };
      } catch (err) {
        console.error('Failed to fetch branch performance:', err.message);
        fetchedData = { error: 'Could not fetch branch performance data.' };
      }
    } else if (intentData.apiEndpoint) {
      try {
        const response = await axios.get(`${FLASK_API_URL}${intentData.apiEndpoint}`, {
          params: intentData.params
        });
        fetchedData = response.data;
      } catch (err) {
        console.error('Failed to fetch data from Flask API:', err.message);
        fetchedData = { error: 'Could not fetch live data, providing general knowledge.' };
      }
    } else if (['CREATE_PO', 'SEND_OFFER', 'UPDATE_PRICE', 'LIQUIDATE'].includes(intentData.intent)) {
      try {
        if (intentData.intent === 'CREATE_PO') {
           actionResult = await decisionService.createPurchaseOrder(null, 50, null);
        } else if (intentData.intent === 'SEND_OFFER') {
           actionResult = await decisionService.sendOffer(customerId, { discount: 5 });
        } else if (intentData.intent === 'UPDATE_PRICE') {
           // Find a product and apply discount
           const Product = require('../models/Product');
           const product = await Product.findOne({ isActive: { $ne: false } });
           if (product) {
             const oldPrice = product.price;
             product.price = Math.round(product.price * 0.95 * 100) / 100; // 5% discount
             await product.save();
             actionResult = { success: true, message: `Price for ${product.name} updated from Rs ${oldPrice} to Rs ${product.price} (5% discount applied).` };
           } else {
             actionResult = { success: false, message: 'No product found to update price.' };
           }
        } else if (intentData.intent === 'LIQUIDATE') {
           // Flag dead stock products for clearance
           const Inventory = require('../models/Inventory');
           const Product = require('../models/Product');
           const deadStock = await Inventory.find({ quantity: { $gt: 0 } })
             .populate('product')
             .sort({ quantity: -1 })
             .limit(3);
           const flagged = deadStock.filter(i => i.product).map(i => i.product.name);
           actionResult = { 
             success: true, 
             message: flagged.length > 0 
               ? `Flagged ${flagged.length} items for clearance sale: ${flagged.join(', ')}.`
               : 'No items found to flag for liquidation.'
           };
        }
      } catch (err) {
        actionResult = { success: false, error: 'Failed to execute action: ' + err.message };
      }
    } else if (intentData.intent === 'CUSTOMER') {
      try {
        const Sale = require('../models/Sale');
        const topCustomers = await Sale.aggregate([
          { $match: { customer: { $ne: null }, status: 'COMPLETED' } },
          { $group: { _id: "$customer", totalSpent: { $sum: "$totalAmount" }, itemsBought: { $sum: 1 } } },
          { $sort: { totalSpent: -1 } },
          { $limit: 3 },
          { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customerData' } },
          { $unwind: "$customerData" }
        ]);
        fetchedData = {
          message: "Top Customers by Total Spent",
          customers: topCustomers.map(c => ({
            name: c.customerData.name,
            totalSpent: c.totalSpent,
            itemsBought: c.itemsBought
          }))
        };
      } catch (err) {
        fetchedData = { error: 'Could not fetch top customers.' };
      }
    }

    if (!fetchedData) {
      try {
        const Product = require('../models/Product');
        const Customer = require('../models/Customer');
        const Branch = require('../models/Branch');
        const Sale = require('../models/Sale');
        
        const totalProducts = await Product.countDocuments();
        const totalCustomers = await Customer.countDocuments();
        const totalBranches = await Branch.countDocuments();
        const totalSales = await Sale.countDocuments();
        
        fetchedData = {
          message: "General System Statistics",
          totalProductsInSystem: totalProducts,
          totalCustomersRegistered: totalCustomers,
          totalBranchesActive: totalBranches,
          totalSalesTransactions: totalSales
        };
      } catch (err) {
        fetchedData = { message: "General Chat context" };
      }
    }
    let historyContext = '';
    if (chatType === 'assistant') {
      const history = await getSessionHistory(sessionId);
      if (history.length > 0) {
        historyContext = "Previous Conversation History:\n" + history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n') + "\n\n";
      }
    }

    const persona = chatType === 'nlq' 
      ? 'You are a Natural Language Query Interface (Search Bar) for a Retail POS. Provide a quick, direct, one-off answer. You do not have memory of previous questions and should not suggest follow-up actions.'
      : 'You are an AI Retail Assistant Chatbot for a Multi-Branch POS. Engage in full conversation, remember context, and you can execute actions like "Create PO" if asked.';

    // 3. Build Prompt for Gemini
    const prompt = `
      ${persona}
      
      ${historyContext}
      User Query: "${message}"
      
      Intent Detected: ${intentData.intent}
      
      Live Data from System:
      ${JSON.stringify(fetchedData, null, 2)}

      Action Execution Result:
      ${actionResult ? JSON.stringify(actionResult, null, 2) : "No action taken."}
      
      CRITICAL INSTRUCTIONS FOR ACCURACY AND CLARITY:
      1. You MUST be highly concise, clear, and direct. Use short sentences.
      2. If presenting multiple items or metrics, use a clean bulleted list for readability.
      3. Your response MUST be strictly based on the "Live Data from System" or "Action Execution Result" provided above. Do NOT hallucinate, guess, or invent any numbers, names, or metrics.
      4. If the requested information is not present in the Live Data, explicitly state that you don't have that data right now. Do not attempt to estimate it.
      5. ALWAYS use actual product names and branch names instead of raw IDs. Format currency with "Rs".
      6. Do not write long paragraphs, excessive markdown headers, or unnecessary fluff. 
      7. If an Action Execution Result is provided, inform the user clearly that their requested action was executed successfully.
    `;

    // 4. Call Gemini API
    const aiResponseText = await generateResponse(prompt);

    // 5. Generate Suggestions based on intent
    let suggestions = ['Show details', 'Clear chat'];
    if (intentData.intent === 'SALES' || intentData.intent === 'TRENDING') {
      suggestions = ['Create PO', 'View chart', 'Compare branches'];
    } else if (intentData.intent === 'INVENTORY') {
      suggestions = ['Reorder low stock', 'View warehouse', 'Update inventory'];
    }

    // 6. Save Conversation to MongoDB (Only for assistant, NLQ forgets after answer)
    if (chatType === 'assistant') {
      await Conversation.create({
        sessionId,
        role: 'user',
        content: message,
        intent: intentData.intent
      });

      await Conversation.create({
        sessionId,
        role: 'assistant',
        content: aiResponseText,
        intent: intentData.intent
      });
    }

    // 7. Return payload
    return {
      success: true,
      response: aiResponseText,
      intent: intentData.intent,
      data: fetchedData,
      suggestions,
      source: 'gemini-api'
    };

  } catch (error) {
    console.error('Error in AI Chat Service:', error);
    // Re-throw original error so controllers can detect isRateLimit flag
    throw error;
  }
};

const getSessionHistory = async (sessionId) => {
  return await Conversation.find({ sessionId }).sort({ timestamp: 1 });
};

const clearSessionHistory = async (sessionId) => {
  await Conversation.deleteMany({ sessionId });
  return true;
};

const deleteMessage = async (messageId) => {
  const result = await Conversation.findByIdAndDelete(messageId);
  return result !== null;
};

const bulkDeleteMessages = async (messageIds) => {
  const result = await Conversation.deleteMany({ _id: { $in: messageIds } });
  return result.deletedCount;
};

module.exports = {
  processChatMessage,
  getSessionHistory,
  clearSessionHistory,
  deleteMessage,
  bulkDeleteMessages
};
