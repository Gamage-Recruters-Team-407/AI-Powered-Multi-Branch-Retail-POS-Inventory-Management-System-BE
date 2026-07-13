const express = require("express");

const {
    addProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    updateProductStock,
    deactivateProduct,
    deleteProduct,
    getProductByBarcode,
    searchProducts,
    getActiveProducts,
    getInactiveProducts,
    reactivateProduct
} = require("../controllers/productController");

const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post("/", upload.single("image"), addProduct);

router.get("/", getAllProducts);
router.get("/barcode/:barcode", getProductByBarcode);
router.get("/search/filter", searchProducts);
router.get("/status/active", getActiveProducts);
router.get("/status/inactive", getInactiveProducts);
router.get("/:id", getProductById);

router.put("/:id", upload.single("image"), updateProduct);

// ── Stock Management (Product Management eken) ─────────────────
// PUT /api/products/:id/stock
// Inventory (branch-level) records update karanawa.
// Warehouse stock view already Inventory aggregate karanawa → auto reflect.
router.put("/:id/stock", updateProductStock);

router.patch("/:id/deactivate", deactivateProduct);
router.patch("/:id/reactivate", reactivateProduct);
router.delete("/:id", deleteProduct);


module.exports = router;
