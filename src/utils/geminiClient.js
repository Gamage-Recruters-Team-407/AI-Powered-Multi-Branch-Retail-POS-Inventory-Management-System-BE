const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

// We will use gemini-1.5-flash for fast and cost-effective text generation
const getGeminiModel = () => {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in environment variables!");
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
};

/**
 * Generate a response using the Gemini API.
 * @param {string} prompt - The full prompt including context, data, and user query
 * @returns {Promise<string>} The generated text response
 */
const generateResponse = async (prompt) => {
  try {
    const model = getGeminiModel();
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating Gemini response:', error);
    // Gracefully handle rate-limit errors
    if (error.status === 429) {
      throw Object.assign(
        new Error('AI service is temporarily rate-limited. Please wait a moment and try again.'),
        { isRateLimit: true }
      );
    }
    throw new Error('Failed to generate AI response: ' + error.message);
  }
};

module.exports = {
  getGeminiModel,
  generateResponse,
};
