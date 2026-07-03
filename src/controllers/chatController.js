const aiChatService = require('../services/aiChatService');

exports.sendMessage = async (req, res) => {
  try {
    const { message, sessionId, customerId, chatType } = req.body;
    if (!message || !sessionId) {
      return res.status(400).json({ success: false, message: 'message and sessionId are required' });
    }

    const result = await aiChatService.processChatMessage(message, sessionId, customerId, chatType);
    res.json(result);
  } catch (error) {
    if (error.isRateLimit) {
      return res.status(503).json({ success: false, error: error.message, retryAfter: 15 });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await aiChatService.getSessionHistory(sessionId);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.clearHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    await aiChatService.clearSessionHistory(sessionId);
    res.json({ success: true, message: 'History cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const success = await aiChatService.deleteMessage(id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.bulkDeleteMessages = async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ success: false, message: 'messageIds array is required' });
    }
    const deletedCount = await aiChatService.bulkDeleteMessages(messageIds);
    res.json({ success: true, message: `${deletedCount} messages deleted` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getSuggestions = async (req, res) => {
  res.json({
    success: true,
    data: ["What are our best selling products?", "Show low stock items", "Compare branch performance"]
  });
};
