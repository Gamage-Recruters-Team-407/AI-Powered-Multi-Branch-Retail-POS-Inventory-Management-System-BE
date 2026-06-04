const axios = require('axios');
const { generateResponse } = require('../utils/geminiClient');
const { detectIntent } = require('./intentDetector');
const Conversation = require('../models/Conversation');

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5001';

/**
 * Handle an incoming chat message, fetch data, and get an AI response.
 */
const processChatMessage = async (message, sessionId, customerId = null) => {
  try {
    // 1. Detect Intent
    const intentData = detectIntent(message, customerId);
    let fetchedData = null;

    // 2. Fetch real data from Recommendation Engine (Flask)
    if (intentData.apiEndpoint) {
      try {
        const response = await axios.get(`${FLASK_API_URL}${intentData.apiEndpoint}`, {
          params: intentData.params
        });
        fetchedData = response.data;
      } catch (err) {
        console.error('Failed to fetch data from Flask API:', err.message);
        fetchedData = { error: 'Could not fetch live data, providing general knowledge.' };
      }
    }

    // 3. Build Prompt for Gemini
    const prompt = `
      You are an AI Retail Assistant for a Multi-Branch POS & Inventory System.
      
      User Query: "${message}"
      
      Intent Detected: ${intentData.intent}
      
      Live Data from System:
      ${JSON.stringify(fetchedData, null, 2)}
      
      IMPORTANT: Your response MUST be highly concise and extremely brief (maximum 2-3 short sentences or a very short bulleted list). Do not write long paragraphs or excessive markdown headers. Get straight to the point based on the live data provided above.
      If the data is an error or missing, apologize briefly.
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

    // 6. Save Conversation to MongoDB
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
    throw new Error('Chat processing failed: ' + error.message);
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
