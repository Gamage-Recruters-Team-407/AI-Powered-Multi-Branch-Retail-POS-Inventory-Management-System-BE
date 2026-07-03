const express = require('express');
const router = express.Router();
const nlqueryController = require('../controllers/nlqueryController');

router.post('/ask', nlqueryController.askQuestion);

module.exports = router;
