const express = require("express");
const router = express.Router();
const controller = require("../controllers/returnsController");

router.get("/invoices", controller.getInvoices);
router.get("/invoices/:invoiceId", controller.getInvoiceById);
router.get("/", controller.getReturns);
router.post("/", controller.createReturn);
router.patch("/:id/status", controller.updateReturnStatus);

module.exports = router;
