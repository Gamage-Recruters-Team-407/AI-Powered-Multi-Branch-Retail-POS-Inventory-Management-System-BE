const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.post('/send', chatController.sendMessage);
router.get('/history/:sessionId', chatController.getHistory);
router.delete('/history/:sessionId', chatController.clearHistory);
router.get('/suggestions', chatController.getSuggestions);
router.delete('/message/:id', chatController.deleteMessage);
router.post('/messages/bulk-delete', chatController.bulkDeleteMessages);

module.exports = router;
