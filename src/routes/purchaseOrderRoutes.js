const express = require('express');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');

const router = express.Router();

const isMongoConnected = () => mongoose.connection.readyState === 1;

const requireMongoConnection = (req, res, next) => {
  if (!isMongoConnected()) {
    return res.status(503).json({
      message: 'MongoDB is not connected yet. Check MONGO_URI, DB_NAME, and Atlas network access.',
    });
  }

  next();
};

const formatOrder = (order) => ({
  id: order._id,
  po: order.poNumber,
  supplier: order.supplierName,
  branch: order.branch,
  date: new Date(order.orderDate).toISOString().slice(0, 10),
  amount: `$${order.totalAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`,
  status: order.status,
});

router.get('/', async (req, res) => {
  if (!isMongoConnected()) {
    return res.json([]);
  }

  const orders = await PurchaseOrder.find().sort({ createdAt: -1 });
  res.json(orders.map(formatOrder));
});

router.post('/', requireMongoConnection, async (req, res) => {
  const { supplier, branch, date, amount } = req.body;
  const totalAmount = Number(amount);
  const orderDate = new Date(date);

  if (!supplier || !branch || !date || !amount) {
    return res.status(400).json({ message: 'Supplier, branch, date, and amount are required.' });
  }

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number.' });
  }

  if (Number.isNaN(orderDate.getTime())) {
    return res.status(400).json({ message: 'Order date must be a valid date.' });
  }

  const count = await PurchaseOrder.countDocuments();
  const order = await PurchaseOrder.create({
    poNumber: `PO-2026-${1049 + count}`,
    supplierName: supplier.trim(),
    branch: branch.trim(),
    orderDate,
    totalAmount,
    status: 'Pending',
  });

  res.status(201).json(formatOrder(order));
});

router.patch('/:id/status', requireMongoConnection, async (req, res) => {
  const { status } = req.body;

  if (!['Pending', 'Approved', 'Rejected', 'Received'].includes(status)) {
    return res.status(400).json({ message: 'Invalid purchase order status.' });
  }

  const order = await PurchaseOrder.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true },
  );

  if (!order) {
    return res.status(404).json({ message: 'Purchase order not found.' });
  }

  res.json(formatOrder(order));
});

module.exports = router;
