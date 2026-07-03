const { detectIntent } = require('../services/intentDetector');
const axios = require('axios');
const { generateResponse } = require('../utils/geminiClient');

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5001';

exports.askQuestion = async (req, res) => {
  try {
    const { question, customerId } = req.body;
    
    if (!question) {
      return res.status(400).json({ success: false, message: 'question is required' });
    }

    const intentData = detectIntent(question, customerId);
    let fetchedData = null;

    if (intentData.apiEndpoint) {
      try {
        const response = await axios.get(`${FLASK_API_URL}${intentData.apiEndpoint}`, {
          params: intentData.params
        });
        fetchedData = response.data;
      } catch (err) {
        console.error('Failed to fetch data from Flask API:', err.message);
      }
    }

    const prompt = `
      You are an AI data analyst for a Retail POS system.
      User asked: "${question}"
      Intent: ${intentData.intent}
      Data: ${JSON.stringify(fetchedData)}
      
      Answer the question concisely in 1-3 sentences based on the data provided.
    `;

    const aiResponseText = await generateResponse(prompt);

    res.json({
      success: true,
      answer: aiResponseText,
      data: fetchedData,
      intent: intentData.intent
    });
  } catch (error) {
    if (error.isRateLimit) {
      return res.status(503).json({ success: false, error: error.message, retryAfter: 15 });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};
