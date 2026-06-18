const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getManagers
} = require('../controllers/userController');

router.route('/').get(getUsers).post(createUser);
// Get all managers
router.get('/managers', getManagers);
router.route('/:id').get(getUserById).put(updateUser).delete(deleteUser);

module.exports = router;