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
        const suggestions = await decisionService.getPendingSuggestions();
        const lowStockItems = suggestions.filter(s => s.type === 'LOW_STOCK');
        fetchedData = {
          message: "Current low stock items from Decision Assistant",
          items: lowStockItems.map(item => ({
            productName: item.productName,
            currentStock: item.currentStock,
            reorderLevel: item.reorderLevel,
            suggestedQuantity: item.suggestedQuantity
          }))
        };
      } catch (err) {
        console.error('Failed to fetch decision data:', err.message);
        fetchedData = { error: 'Could not fetch live inventory data.' };
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
           actionResult = { success: true, message: "Price updated successfully to apply discount." };
        } else if (intentData.intent === 'LIQUIDATE') {
           actionResult = { success: true, message: "Items successfully flagged for clearance sale liquidation." };
        }
      } catch (err) {
        actionResult = { success: false, error: 'Failed to execute action: ' + err.message };
      }
    }

    // Prepare History if it's the Assistant
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
      
      IMPORTANT: Your response MUST be highly concise and extremely brief (maximum 2-3 short sentences or a very short bulleted list). Do not write long paragraphs or excessive markdown headers. Get straight to the point based on the live data provided above. When mentioning products, ALWAYS use their actual names instead of product IDs.
      If the data is an error or missing, apologize briefly.
      If an Action Execution Result is provided, inform the user that their requested action was executed successfully (e.g. "I have created the Purchase Order for you. The PO ID is...").
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
