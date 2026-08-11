const Sale = require("../models/Sale");
const Product = require("../models/Product");

const createSale = async (req, res) => {
  const deductedProducts = [];

  try {
    const {
      items,
      paymentMethod,
      customerId,
      cashReceived,
      taxRate = 0,
      discountAmount = 0,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    const enrichedItems = [];
    let subtotal = 0;

    // 1. Validate products and stock
    for (const item of items) {
      const productId = item.productId || item.product || item._id;
      const quantity = Number(item.quantity || item.qty || 0);

      if (!productId || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product or quantity.",
        });
      }

      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.name || productId}`,
        });
      }

      if (product.isActive === false) {
        return res.status(400).json({
          success: false,
          message: `${product.name} is inactive.`,
        });
      }

      // You are using reorderLevel as stock count
      const availableStock = Number(product.reorderLevel || 0);

      if (availableStock < quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.name} has only ${availableStock} stock available.`,
        });
      }

      const unitPrice = Number(product.price || item.price || item.unitPrice || 0);
      const itemDiscount = Number(item.discount || 0);

      const lineTotal = Number(
        (unitPrice * quantity * (1 - itemDiscount / 100)).toFixed(2)
      );

      subtotal += lineTotal;

      enrichedItems.push({
        product: product._id,
        name: product.name,
        barcode: product.barcode,
        quantity,
        unitPrice,
        discount: itemDiscount,
        lineTotal,
      });
    }

    const safeDiscountAmount = Math.min(Number(discountAmount || 0), subtotal);

    const taxAmount = Number(
      (((subtotal - safeDiscountAmount) * Number(taxRate || 0)) / 100).toFixed(2)
    );

    const totalAmount = Number(
      (subtotal - safeDiscountAmount + taxAmount).toFixed(2)
    );

    // 2. Validate payment before reducing stock
    if (paymentMethod === "CASH") {
      if (!cashReceived || Number(cashReceived) < totalAmount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient cash received.",
        });
      }
    }

    // 3. Reduce stock from Product.reorderLevel
    for (const item of enrichedItems) {
      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: item.product,
          reorderLevel: { $gte: item.quantity },
        },
        {
          $inc: {
            reorderLevel: -item.quantity,
          },
        },
        {
          new: true,
        }
      );

      if (!updatedProduct) {
        // rollback already reduced products
        for (const rollbackItem of deductedProducts) {
          await Product.findByIdAndUpdate(rollbackItem.product, {
            $inc: {
              reorderLevel: rollbackItem.quantity,
            },
          });
        }

        return res.status(400).json({
          success: false,
          message: `${item.name} does not have enough stock available.`,
        });
      }

      deductedProducts.push({
        product: item.product,
        quantity: item.quantity,
      });
    }

    const changeGiven =
      paymentMethod === "CASH"
        ? Number((Number(cashReceived) - totalAmount).toFixed(2))
        : 0;

    // 4. Save sale
    const sale = new Sale({
      customer: customerId || null,
      cashier: req.user?._id,
      branch: req.user?.branch || null,
      items: enrichedItems,
      subtotal,
      discountAmount: safeDiscountAmount,
      taxRate,
      taxAmount,
      totalAmount,
      paymentMethod,
      cashReceived: paymentMethod === "CASH" ? Number(cashReceived) : undefined,
      changeGiven: paymentMethod === "CASH" ? changeGiven : undefined,
      status: "COMPLETED",
    });

    await sale.save();

    const populatedSale = await Sale.findById(sale._id)
      .populate("customer", "name phone email")
      .populate("cashier", "name username")
      .populate("branch", "name address");

    return res.status(201).json({
      success: true,
      message: "Sale completed successfully. Stock updated.",
      data: populatedSale,
    });
  } catch (error) {
    // rollback stock if sale fails
    for (const rollbackItem of deductedProducts) {
      await Product.findByIdAndUpdate(rollbackItem.product, {
        $inc: {
          reorderLevel: rollbackItem.quantity,
        },
      });
    }

    console.error("createSale error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to process sale",
      error: error.message,
    });
  }
};

// Get all sales
const getAllSales = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      paymentMethod,
      cashier,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};

    if (req.user?.branch) {
      filter.branch = req.user.branch;
    }

    if (startDate || endDate) {
      filter.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (cashier) filter.cashier = cashier;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    const total = await Sale.countDocuments(filter);

    const sales = await Sale.find(filter)
      .populate("customer", "name phone email")
      .populate("cashier", "name username")
      .populate("branch", "name address")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    return res.json({
      success: true,
      count: sales.length,
      data: sales,
      pagination: {
        total,
        page: pageNumber,
        pages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("getAllSales error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch sales",
      error: error.message,
    });
  }
};

// Get sale by ID
const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("customer", "name phone email")
      .populate("cashier", "name username")
      .populate("branch", "name address")
      .populate({
        path: "items.product",
        select: "name barcode image category categoryName",
        populate: {
          path: "category",
          select: "name",
        },
      });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found",
      });
    }

    return res.json({
      success: true,
      data: sale,
    });
  } catch (error) {
    console.error("getSaleById error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch sale",
      error: error.message,
    });
  }
};

// Void sale and restore Product.reorderLevel
const voidSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found",
      });
    }

    if (sale.status !== "COMPLETED") {
      return res.status(400).json({
        success: false,
        message: "Only completed sales can be voided",
      });
    }

    sale.status = "VOIDED";
    await sale.save();

    for (const item of sale.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { reorderLevel: item.quantity },
      });
    }

    return res.json({
      success: true,
      message: "Sale voided successfully and stock restored",
      data: sale,
    });
  } catch (error) {
    console.error("voidSale error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to void sale",
      error: error.message,
    });
  }
};

// Sales summary
const getSalesSummary = async (req, res) => {
  try {
    const { period = "today", startDate: qStart, endDate: qEnd } = req.query;
    const now = new Date();
    let start, end;

    if (qStart && qEnd) {
      start = new Date(qStart);
      start.setHours(0, 0, 0, 0);
      end = new Date(qEnd);
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      if (period === "today") {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      } else if (period === "week") {
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      } else {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      }
    }

    const matchFilter = {
      status: "COMPLETED",
      createdAt: { $gte: start, $lte: end },
    };
    if (req.user.branch) matchFilter.branch = req.user.branch;

    const summary = await Sale.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          totalTransactions: { $count: {} },
          avgTransactionValue: { $avg: "$totalAmount" },
          cashSales: { $sum: { $cond: [{ $eq: ["$paymentMethod", "CASH"] }, "$totalAmount", 0] } },
          cardSales: { $sum: { $cond: [{ $eq: ["$paymentMethod", "CARD"] }, "$totalAmount", 0] } },
          qrSales:   { $sum: { $cond: [{ $eq: ["$paymentMethod", "QR"] },   "$totalAmount", 0] } },
        },
      },
    ]);

    res.json({
      success: true,
      data: summary[0] || {
        totalRevenue: 0, totalTransactions: 0, avgTransactionValue: 0,
        cashSales: 0, cardSales: 0, qrSales: 0,
      },
      period,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
  

// Product by barcode using reorderLevel as stock
const getProductByBarcode = async (req, res) => {
  try {
    const product = await Product.findOne({
      barcode: req.params.barcode,
      isActive: true,
    }).populate("category", "name");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const productObject = product.toObject();
    const stock = Number(productObject.reorderLevel || 0);

    return res.json({
      success: true,
      data: {
        ...productObject,
        stock,
        quantity: stock,
        availableStock: stock,
      },
    });
  } catch (error) {
    console.error("getProductByBarcode error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to find product by barcode",
      error: error.message,
    });
  }
};

module.exports = {
  createSale,
  getAllSales,
  getSaleById,
  voidSale,
  getSalesSummary,
  getProductByBarcode,
};