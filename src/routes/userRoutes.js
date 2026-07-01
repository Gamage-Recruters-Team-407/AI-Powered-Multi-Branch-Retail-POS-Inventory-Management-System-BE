const express = require("express");
const router = express.Router();

const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  approveUser,
  rejectUser,
  deleteUser,
  searchUsers,
  getManagers,
} = require("../controllers/userController");

const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/search", authorize("admin", "super_admin", "manager"), searchUsers);
router.get("/managers", authorize("admin", "super_admin", "manager"), getManagers);

router
  .route("/")
  .get(authorize("admin", "super_admin", "manager"), getUsers)
  .post(authorize("admin", "super_admin"), createUser);

router.patch("/:id/approve", authorize("admin", "super_admin"), approveUser);
router.patch("/:id/reject", authorize("admin", "super_admin"), rejectUser);

router
  .route("/:id")
  .get(authorize("admin", "super_admin", "manager"), getUserById)
  .put(authorize("admin", "super_admin"), updateUser)
  .delete(authorize("admin", "super_admin"), deleteUser);

module.exports = router;