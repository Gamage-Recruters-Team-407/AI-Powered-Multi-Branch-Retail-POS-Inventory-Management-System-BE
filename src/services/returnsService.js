const Branch = require("../models/Branch");
const Customer = require("../models/Customer");
const Invoice = require("../models/Invoice");
const Return = require("../models/Return");
const Sale = require("../models/Sale");

const RETURN_WINDOW_DAYS = 30;

const fallbackInvoices = [
  {
    id: "INV-2026-004",
    customer: "Nethmi Perera",
    branch: "Colombo Main (HQ)",
    date: "2026-06-09",
    paymentMethod: "Card",
    items: [
      { id: "PROD-1001", name: "Mechanical Keyboard", qty: 1, price: 89.99, returnedQty: 0 },
      { id: "PROD-1002", name: "Wireless Mouse", qty: 1, price: 25.99, returnedQty: 0 }
    ],
    taxRate: 0.12,
    discountAmount: 8.0
  },
  {
    id: "INV-2026-005",
    customer: "Kavindu Senanayake",
    branch: "Kandy City Mall",
    date: "2026-06-08",
    paymentMethod: "Cash",
    items: [
      { id: "PROD-1003", name: "Bluetooth Speaker", qty: 1, price: 45.0, returnedQty: 0 },
      { id: "PROD-1004", name: "USB-C Cable", qty: 2, price: 12.5, returnedQty: 0 }
    ],
    taxRate: 0.08,
    discountAmount: 5.0
  },
  {
    id: "INV-2026-006",
    customer: "Anudi Fernando",
    branch: "Galle Harbour Rd",
    date: "2026-05-28",
    paymentMethod: "Digital Wallet",
    items: [
      { id: "PROD-1005", name: "Desk Lamp", qty: 1, price: 22.0, returnedQty: 0 },
      { id: "PROD-1006", name: "Notebook", qty: 3, price: 4.99, returnedQty: 0 }
    ],
    taxRate: 0.1,
    discountAmount: 3.0
  }
];

const fallbackReturns = [
  {
    id: "RET-2026-001",
    invoiceId: "INV-2026-004",
    customer: "Nethmi Perera",
    branch: "Colombo Main (HQ)",
    date: "2026-06-12",
    subtotal: 25.99,
    discountAmount: 1.81,
    taxAmount: 2.9,
    amount: 27.08,
    paymentMethod: "Card",
    status: "Refunded",
    approvalRequired: false,
    reason: "Accessory no longer needed",
    condition: "Resellable (Restock)",
    items: [{ id: "PROD-1002", name: "Wireless Mouse", qty: 1, price: 25.99 }]
  },
  {
    id: "RET-2026-002",
    invoiceId: "INV-2026-006",
    customer: "Anudi Fernando",
    branch: "Galle Harbour Rd",
    date: "2026-06-23",
    subtotal: 4.99,
    discountAmount: 0.4,
    taxAmount: 0.46,
    amount: 5.05,
    paymentMethod: "Digital Wallet",
    status: "Pending Approval",
    approvalRequired: true,
    reason: "Wrong item purchased",
    condition: "Resellable (Restock)",
    items: [{ id: "PROD-1006", name: "Notebook", qty: 1, price: 4.99 }]
  }
];

const paymentMethodLabels = {
  CASH: "Cash",
  CARD: "Card",
  QR: "QR",
};

const toDateOnly = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
};

const normalizeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCustomerName = (customerDoc) => {
  if (!customerDoc) {
    return "Walk-in Customer";
  }

  const firstName = customerDoc.firstName || "";
  const lastName = customerDoc.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || customerDoc.name || customerDoc.email || "Walk-in Customer";
};

const formatPaymentMethod = (value) => paymentMethodLabels[value] || value || "Unknown";

const mapSaleToInvoice = (sale) => ({
  id: sale.invoiceNumber,
  customer: normalizeCustomerName(sale.customer),
  branch: sale.branch?.name || "Unassigned Branch",
  date: toDateOnly(sale.createdAt),
  paymentMethod: formatPaymentMethod(sale.paymentMethod),
  items: (sale.items || []).map((item, index) => ({
    id: item.product?._id?.toString() || item.barcode || `${sale.invoiceNumber}-ITEM-${index + 1}`,
    name: item.name,
    qty: normalizeNumber(item.quantity),
    price: normalizeNumber(item.unitPrice),
    returnedQty: 0,
  })),
  taxRate: normalizeNumber(sale.taxRate) > 1 ? normalizeNumber(sale.taxRate) / 100 : normalizeNumber(sale.taxRate),
  discountAmount: normalizeNumber(sale.discountAmount),
});

const mergeReturnableItems = (items = []) => {
  const mergedItems = new Map();

  items.forEach((item) => {
    const itemId = String(item?.id || "").trim();
    const qty = Math.max(0, parseInt(item?.qty, 10) || 0);

    if (!itemId || qty <= 0) {
      return;
    }

    const currentItem = mergedItems.get(itemId);
    if (currentItem) {
      currentItem.qty += qty;
      return;
    }

    mergedItems.set(itemId, {
      id: itemId,
      name: item?.name || "",
      qty,
      price: normalizeNumber(item?.price),
    });
  });

  return Array.from(mergedItems.values());
};

const calculateRefundBreakdown = (invoice, itemsToReturn) => {
  const invoiceSubtotal = (invoice.items || []).reduce(
    (sum, item) => sum + normalizeNumber(item.qty) * normalizeNumber(item.price),
    0
  );
  const subtotal = itemsToReturn.reduce(
    (sum, item) => sum + normalizeNumber(item.qty) * normalizeNumber(item.price),
    0
  );
  const discountRate = invoiceSubtotal > 0 ? normalizeNumber(invoice.discountAmount) / invoiceSubtotal : 0;
  const discountAmount = subtotal * discountRate;
  const taxableAmount = subtotal - discountAmount;
  const taxRate = normalizeNumber(invoice.taxRate);
  const taxAmount = taxableAmount * taxRate;
  const amount = taxableAmount + taxAmount;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    amount: Number(amount.toFixed(2)),
    paymentMethod: invoice.paymentMethod,
  };
};

const isReturnWindowValid = (invoiceDate, referenceDate = new Date()) => {
  const purchaseDate = new Date(invoiceDate);

  if (Number.isNaN(purchaseDate.getTime())) {
    return false;
  }

  const diffInMs = referenceDate.getTime() - purchaseDate.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  return diffInDays >= 0 && diffInDays <= RETURN_WINDOW_DAYS;
};

const buildDemoReturnFromInvoice = (invoice, sequence, overrides = {}) => {
  const primaryItem = (invoice.items || []).find((item) => normalizeNumber(item.qty) > 0);
  if (!primaryItem) {
    return null;
  }

  const items = [{
    id: primaryItem.id,
    name: primaryItem.name,
    qty: 1,
    price: normalizeNumber(primaryItem.price),
  }];
  const breakdown = calculateRefundBreakdown(invoice, items);

  return {
    id: `RET-2026-${String(sequence).padStart(3, "0")}`,
    invoiceId: invoice.id,
    customer: invoice.customer,
    branch: invoice.branch,
    date: toDateOnly(new Date()),
    paymentMethod: invoice.paymentMethod,
    reason: overrides.reason || "Customer requested a standard return",
    condition: overrides.condition || "Resellable (Restock)",
    status: overrides.status || (isReturnWindowValid(invoice.date) ? "Refunded" : "Pending Approval"),
    approvalRequired: overrides.status
      ? overrides.status === "Pending Approval"
      : !isReturnWindowValid(invoice.date),
    items,
    ...breakdown,
  };
};

class ReturnsService {
  async seedDefaultData() {
    try {
      const invoiceCount = await Invoice.countDocuments();

      if (invoiceCount === 0) {
        const sales = await Sale.find({ status: { $in: ["COMPLETED", "REFUNDED"] } })
          .populate("customer", "firstName lastName email")
          .populate("branch", "name")
          .sort({ createdAt: -1 })
          .limit(12);

        if (sales.length > 0) {
          await Invoice.insertMany(sales.map(mapSaleToInvoice), { ordered: false });
          console.log("Seeded return invoices from sales data");
        } else {
          await this.seedFallbackInvoices();
        }
      }

      const returnsCount = await Return.countDocuments();
      if (returnsCount === 0) {
        await this.seedFallbackReturns();
      }
    } catch (error) {
      console.error("Failed to seed returns/invoices default data:", error.message);
    }
  }

  async seedFallbackInvoices() {
    const customerDocs = await Customer.find({})
      .sort({ createdAt: 1 })
      .limit(3)
      .lean();
    const branchDocs = await Branch.find({ isActive: true })
      .sort({ createdAt: 1 })
      .limit(3)
      .lean();

    const invoicesToSeed = fallbackInvoices.map((invoice, index) => ({
      ...invoice,
      customer: normalizeCustomerName(customerDocs[index]) || invoice.customer,
      branch: branchDocs[index]?.name || invoice.branch,
    }));

    await Invoice.insertMany(invoicesToSeed, { ordered: false });
    console.log("Seeded fallback return invoices");
  }

  async seedFallbackReturns() {
    const invoices = await Invoice.find({}).sort({ createdAt: -1 }).lean();
    const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

    let returnsToSeed = fallbackReturns
      .map((entry) => {
        const invoice = invoicesById.get(entry.invoiceId);
        if (!invoice) {
          return null;
        }

        const breakdown = calculateRefundBreakdown(invoice, entry.items);
        return {
          ...entry,
          customer: invoice.customer,
          branch: invoice.branch,
          paymentMethod: invoice.paymentMethod,
          subtotal: breakdown.subtotal,
          discountAmount: breakdown.discountAmount,
          taxAmount: breakdown.taxAmount,
          amount: breakdown.amount,
          approvalRequired: entry.status === "Pending Approval",
        };
      })
      .filter(Boolean);

    if (returnsToSeed.length === 0) {
      returnsToSeed = invoices
        .slice(0, 2)
        .map((invoice, index) => buildDemoReturnFromInvoice(invoice, index + 1, {
          reason: index === 0 ? "Customer requested a standard return" : "Item needs supervisor review",
          status: index === 1 && !isReturnWindowValid(invoice.date) ? "Pending Approval" : "Refunded",
        }))
        .filter(Boolean);
    }

    if (returnsToSeed.length > 0) {
      await Return.insertMany(returnsToSeed, { ordered: false });
      console.log("Seeded fallback returns data");

      for (const seededReturn of returnsToSeed) {
        await this.applyReturnedQty(seededReturn.invoiceId, seededReturn.items, 1);
      }
    }
  }

  async getAllInvoices() {
    await this.seedDefaultData();
    return Invoice.find({}).sort({ createdAt: -1 });
  }

  async getInvoiceById(invoiceId) {
    await this.seedDefaultData();
    return Invoice.findOne({ id: invoiceId });
  }

  async getAllReturns() {
    await this.seedDefaultData();
    return Return.find({}).sort({ createdAt: -1 });
  }

  async createReturn(data) {
    await this.seedDefaultData();

    const invoice = await Invoice.findOne({ id: data.invoiceId });
    if (!invoice) {
      const error = new Error(`Invoice with ID ${data.invoiceId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    const itemsToReturn = mergeReturnableItems(data.items);
    if (itemsToReturn.length === 0) {
      const error = new Error("Please select at least one item to return.");
      error.statusCode = 400;
      throw error;
    }

    const validatedItems = itemsToReturn.map((item) => {
      const invoiceItem = invoice.items.find((candidate) => candidate.id === item.id);

      if (!invoiceItem) {
        const error = new Error(`Item ${item.id} does not belong to invoice ${invoice.id}.`);
        error.statusCode = 400;
        throw error;
      }

      const alreadyReturnedQty = normalizeNumber(invoiceItem.returnedQty);
      const purchasedQty = normalizeNumber(invoiceItem.qty);
      const remainingQty = purchasedQty - alreadyReturnedQty;

      if (item.qty > remainingQty) {
        const error = new Error(
          `Only ${remainingQty} unit(s) of ${invoiceItem.name} can be returned from invoice ${invoice.id}.`
        );
        error.statusCode = 400;
        throw error;
      }

      return {
        id: invoiceItem.id,
        name: invoiceItem.name,
        qty: item.qty,
        price: normalizeNumber(invoiceItem.price),
      };
    });

    const count = await Return.countDocuments();
    const nextSequence = String(count + 1).padStart(3, "0");
    const approvalRequired = !isReturnWindowValid(invoice.date);
    const breakdown = calculateRefundBreakdown(invoice, validatedItems);

    const payload = {
      id: `RET-2026-${nextSequence}`,
      invoiceId: invoice.id,
      customer: invoice.customer,
      branch: invoice.branch,
      date: toDateOnly(new Date()),
      reason: data.reason,
      condition: data.condition,
      items: validatedItems,
      status: approvalRequired ? "Pending Approval" : "Refunded",
      approvalRequired,
      ...breakdown,
    };

    const newReturn = await Return.create(payload);
    await this.applyReturnedQty(invoice.id, validatedItems, 1);

    return newReturn;
  }

  async updateReturnStatus(returnId, status) {
    await this.seedDefaultData();

    const allowedStatuses = ["Refunded", "Pending Approval", "Rejected"];
    if (!allowedStatuses.includes(status)) {
      const error = new Error(`Invalid status "${status}".`);
      error.statusCode = 400;
      throw error;
    }

    const existingReturn = await Return.findOne({ id: returnId });
    if (!existingReturn) {
      const error = new Error(`Return request with ID ${returnId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    if (existingReturn.status === status) {
      return existingReturn;
    }

    if (status === "Rejected" && existingReturn.status !== "Rejected") {
      await this.applyReturnedQty(existingReturn.invoiceId, existingReturn.items, -1);
    }

    if (existingReturn.status === "Rejected" && status !== "Rejected") {
      await this.applyReturnedQty(existingReturn.invoiceId, existingReturn.items, 1);
    }

    existingReturn.status = status;
    existingReturn.approvalRequired = status === "Pending Approval";
    await existingReturn.save();

    return existingReturn;
  }

  async applyReturnedQty(invoiceId, items, direction) {
    const invoice = await Invoice.findOne({ id: invoiceId });
    if (!invoice) {
      return;
    }

    items.forEach((item) => {
      const invoiceItem = invoice.items.find((candidate) => candidate.id === item.id);
      if (!invoiceItem) {
        return;
      }

      const currentValue = normalizeNumber(invoiceItem.returnedQty);
      invoiceItem.returnedQty = Math.max(0, currentValue + direction * normalizeNumber(item.qty));
    });

    await invoice.save();
  }
}

module.exports = new ReturnsService();
