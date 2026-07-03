const express = require("express");

const {
    addProduct,
    getAllProducts,
    getProductById,
    updateProduct,
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
router.get("/:id", getProductById);
router.get("/barcode/:barcode", getProductByBarcode);
router.get("/search/filter", searchProducts);

router.put("/:id", upload.single("image"), updateProduct);
router.patch("/:id/deactivate", deactivateProduct);
router.delete("/:id", deleteProduct);

router.get("/status/active", getActiveProducts);
router.get("/status/inactive", getInactiveProducts);
router.patch("/:id/reactivate", reactivateProduct);


module.exports = router;