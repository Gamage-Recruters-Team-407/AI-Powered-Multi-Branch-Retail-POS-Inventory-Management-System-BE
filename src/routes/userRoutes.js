const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  searchUsers,
  getManagers
} = require('../controllers/userController');

router.get('/search', searchUsers);  
router.route('/').get(getUsers).post(createUser);
// Get all managers
router.get('/managers', getManagers);
router.route('/:id').get(getUserById).put(updateUser).delete(deleteUser);

module.exports = router;