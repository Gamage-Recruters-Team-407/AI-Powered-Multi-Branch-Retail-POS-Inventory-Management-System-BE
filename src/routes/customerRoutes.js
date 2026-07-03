const router = require("express").Router();

const controller = require("../controllers/customerController");

// CRUD
router.post("/", controller.createCustomer);
router.get("/", controller.getCustomers);
router.get("/:id", controller.getCustomer);
router.put("/:id", controller.updateCustomer);
router.delete("/:id", controller.deleteCustomer);

router.get(
    "/branch/:branchId",
    controller.getCustomersByBranch
);

// EXTRA FEATURES 
// router.get("/:id/purchases", controller.purchaseHistory);
router.get("/analytics/overview", controller.analytics);

router.post("/loyalty/add", controller.addLoyaltyPoints);

module.exports = router;