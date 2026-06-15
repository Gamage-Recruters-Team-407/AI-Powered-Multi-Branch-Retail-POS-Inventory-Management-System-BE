const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Inventory = require("../models/Inventory");

// 1. Create a new Sale 
const createSale = async (req, res) => {
  try {
    const { items, paymentMethod, customerId, cashReceived, taxRate = 0, discountAmount = 0 } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const enrichedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product ${item.productId} not found` });
      }
      if (!product.isActive) {
        return res.status(400).json({ success: false, message: `Product "${product.name}" is inactive` });
      }

      const lineTotal = parseFloat((product.price * item.quantity * (1 - (item.discount || 0) / 100)).toFixed(2));
      subtotal += lineTotal;

      enrichedItems.push({
        product: product._id,
        name: product.name,
        barcode: product.barcode,
        quantity: item.quantity,
        unitPrice: product.price,
        discount: item.discount || 0,
        lineTotal,
      });
    }

    const taxAmount = parseFloat(((subtotal - discountAmount) * taxRate / 100).toFixed(2));
    const totalAmount = parseFloat((subtotal - discountAmount + taxAmount).toFixed(2));

    if (paymentMethod === "CASH") {
      if (!cashReceived || cashReceived < totalAmount) {
        return res.status(400).json({ success: false, message: "Insufficient cash received" });
      }
    }

    const changeGiven = paymentMethod === "CASH" ? parseFloat((cashReceived - totalAmount).toFixed(2)) : 0;

    const sale = new Sale({
      customer: customerId || null,
      cashier: req.user._id,
      branch: req.user.branch,
      items: enrichedItems,
      subtotal,
      discountAmount,
      taxRate,
      taxAmount,
      totalAmount,
      paymentMethod,
      cashReceived: paymentMethod === "CASH" ? cashReceived : undefined,
      changeGiven: paymentMethod === "CASH" ? changeGiven : undefined,
      status: "COMPLETED",
    });

    await sale.save();

    // for (const item of enrichedItems) {
    //   await Inventory.findOneAndUpdate(
    //     { product: item.product, branch: req.user.branch },
    //     { $inc: { quantity: -item.quantity } }
    //   );
    // }
    if (req.user.branch) {
  for (const item of enrichedItems) {
    await Inventory.findOneAndUpdate(
      { product: item.product, branch: req.user.branch },
      { $inc: { quantity: -item.quantity } }
    );
  }
}

    const populatedSale = await Sale.findById(sale._id)
      .populate("customer", "name phone email")
      .populate("cashier", "name username")
      .populate("branch", "name address");

    res.status(201).json({
      success: true,
      message: "Sale completed successfully",
      data: populatedSale,
    });
  } catch (error) {
    console.error("createSale error:", error);
    res.status(500).json({ success: false, message: "Failed to process sale", error: error.message });
  }
};

// 2. Get all Sales
const getAllSales = async (req, res) => {
  try {
    const { startDate, endDate, paymentMethod, cashier, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (req.user.branch) filter.branch = req.user.branch;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (cashier) filter.cashier = cashier;

    const total = await Sale.countDocuments(filter);
    const sales = await Sale.find(filter)
      .populate("customer", "name phone")
      .populate("cashier", "name username")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: sales,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Get single Sale by ID
const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("customer", "name phone email")
      .populate("cashier", "name username")
      .populate("branch", "name address phone")
      .populate("items.product", "name barcode image");

    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });

    res.json({ success: true, data: sale });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4.  Sale
const voidSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
    if (sale.status !== "COMPLETED") {
      return res.status(400).json({ success: false, message: "Only completed sales can be voided" });
    }

    sale.status = "VOIDED";
    await sale.save();

    for (const item of sale.items) {
      await Inventory.findOneAndUpdate(
        { product: item.product, branch: sale.branch },
        { $inc: { quantity: item.quantity } }
      );
    }

    res.json({ success: true, message: "Sale voided successfully", data: sale });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Sales Summary
const getSalesSummary = async (req, res) => {
  try {
    const { period = "today" } = req.query;
    const now = new Date();
    let startDate;

    if (period === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const summary = await Sale.aggregate([
      {
        $match: {
          branch: req.user.branch,
          status: "COMPLETED",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          totalTransactions: { $count: {} },
          avgTransactionValue: { $avg: "$totalAmount" },
          cashSales: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "CASH"] }, "$totalAmount", 0] },
          },
          cardSales: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "CARD"] }, "$totalAmount", 0] },
          },
          qrSales: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "QR"] }, "$totalAmount", 0] },
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: summary[0] || {
        totalRevenue: 0,
        totalTransactions: 0,
        avgTransactionValue: 0,
        cashSales: 0,
        cardSales: 0,
        qrSales: 0,
      },
      period,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Search by barcode 
const getProductByBarcode = async (req, res) => {
  try {
    const product = await Product.findOne({
      barcode: req.params.barcode,
      isActive: true,
    }).populate("category", "name");

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Exporting all functions correctly
module.exports = {
  createSale,
  getAllSales,
  getSaleById,
  voidSale,
  getSalesSummary,
  getProductByBarcode
};