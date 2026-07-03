const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createSale,
  getAllSales,
  getSaleById,
  voidSale,
  getSalesSummary,
  getProductByBarcode,
} = require("../controllers/salesController");

// All routes require authentication
router.use(protect);

// Sales CRUD
router.post("/", createSale);               // POST   /api/sales
router.get("/", getAllSales);               // GET    /api/sales?startDate=&endDate=&paymentMethod=
router.get("/summary", getSalesSummary);    // GET    /api/sales/summary?period=today|week|month
router.get("/:id", getSaleById);            // GET    /api/sales/:id
router.patch("/:id/void", voidSale);        // PATCH  /api/sales/:id/void

// Barcode lookup 
router.get("/barcode/:barcode", getProductByBarcode); // GET /api/sales/barcode/:barcode

module.exports = router;
