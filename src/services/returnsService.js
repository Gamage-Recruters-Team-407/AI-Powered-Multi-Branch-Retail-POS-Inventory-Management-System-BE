const Invoice = require("../models/Invoice");
const Return = require("../models/Return");

const initialInvoices = [
  {
    id: "INV-2026-001",
    customer: "Yasith Silva",
    branch: "Colombo Main (HQ)",
    date: "2026-05-20",
    paymentMethod: "Credit Card",
    items: [
      { id: "PROD-101", name: "iPad Pro 11-inch M4", qty: 1, price: 999.0, returnedQty: 0 },
      { id: "PROD-102", name: "Apple Pencil Pro", qty: 1, price: 129.0, returnedQty: 0 },
      { id: "PROD-103", name: "Paperlike Screen Protector", qty: 2, price: 39.99, returnedQty: 1 }
    ],
    taxRate: 0.12,
    discountAmount: 50.0
  },
  {
    id: "INV-2026-002",
    customer: "Malmi Shehara",
    branch: "Kandy City Mall",
    date: "2026-04-10",
    paymentMethod: "Cash",
    items: [
      { id: "PROD-201", name: "MacBook Air M3", qty: 1, price: 1099.0, returnedQty: 0 },
      { id: "PROD-202", name: "Apple Magic Mouse", qty: 1, price: 79.0, returnedQty: 0 }
    ],
    taxRate: 0.08,
    discountAmount: 0.0
  },
  {
    id: "INV-2026-003",
    customer: "Gavesha Thathsarani",
    branch: "Galle Harbour Rd",
    date: "2026-05-29",
    paymentMethod: "Digital Wallet",
    items: [
      { id: "PROD-301", name: "Sony WH-1000XM5 Headphones", qty: 1, price: 399.0, returnedQty: 0 },
      { id: "PROD-302", name: "Anker USB-C Hub 7-in-1", qty: 2, price: 49.99, returnedQty: 0 }
    ],
    taxRate: 0.1,
    discountAmount: 20.0
  },
  {
    id: "INV-2026-004",
    customer: "Nethmi Perera",
    branch: "Colombo Main (HQ)",
    date: "2026-06-09",
    paymentMethod: "Credit Card",
    items: [
      { id: "PROD-401", name: "Samsung Galaxy Tab S9", qty: 1, price: 799.0, returnedQty: 0 },
      { id: "PROD-402", name: "Tablet Keyboard Case", qty: 1, price: 89.0, returnedQty: 0 }
    ],
    taxRate: 0.12,
    discountAmount: 25.0
  },
  {
    id: "INV-2026-005",
    customer: "Kavindu Senanayake",
    branch: "Kandy City Mall",
    date: "2026-06-08",
    paymentMethod: "Cash",
    items: [
      { id: "PROD-501", name: "JBL Charge 5 Speaker", qty: 1, price: 179.0, returnedQty: 0 },
      { id: "PROD-502", name: "USB-C Fast Charger", qty: 2, price: 24.5, returnedQty: 0 }
    ],
    taxRate: 0.08,
    discountAmount: 10.0
  },
  {
    id: "INV-2026-006",
    customer: "Anudi Fernando",
    branch: "Galle Harbour Rd",
    date: "2026-05-28",
    paymentMethod: "Digital Wallet",
    items: [
      { id: "PROD-601", name: "Canon PIXMA Printer", qty: 1, price: 249.0, returnedQty: 0 },
      { id: "PROD-602", name: "Printer Ink Combo Pack", qty: 1, price: 59.99, returnedQty: 0 }
    ],
    taxRate: 0.1,
    discountAmount: 15.0
  }
];

const initialReturns = [
  {
    id: "RET-2026-001",
    invoiceId: "INV-2026-001",
    customer: "Dave Smith",
    branch: "Colombo Main (HQ)",
    date: "2026-05-22",
    amount: 44.79,
    status: "Refunded",
    reason: "Defective item",
    condition: "Damaged (Write-off)",
    items: [{ id: "PROD-103", name: "Paperlike Screen Protector", qty: 1, price: 39.99 }]
  },
  {
    id: "RET-2026-002",
    invoiceId: "INV-2026-003",
    customer: "John Doe",
    branch: "Galle Harbour Rd",
    date: "2026-06-01",
    amount: 109.98,
    status: "Pending Approval",
    reason: "Wrong item shipped",
    condition: "Resellable (Restock)",
    items: [{ id: "PROD-302", name: "Anker USB-C Hub 7-in-1", qty: 2, price: 49.99 }]
  }
];

class ReturnsService {
  async seedDefaultData() {
    try {
      const invoiceCount = await Invoice.countDocuments();
      if (invoiceCount === 0) {
        await Invoice.insertMany(initialInvoices);
        console.log("Seeded initial invoices data");
      } else {
        for (const invoice of initialInvoices) {
          await Invoice.updateOne(
            { id: invoice.id },
            { $setOnInsert: invoice },
            { upsert: true }
          );
        }
      }

      const returnsCount = await Return.countDocuments();
      if (returnsCount === 0) {
        await Return.insertMany(initialReturns);
        console.log("Seeded initial returns data");
      }
    } catch (error) {
      console.error("Failed to seed returns/invoices default data:", error.message);
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
      throw new Error(`Invoice with ID ${data.invoiceId} not found.`);
    }

    const count = await Return.countDocuments();
    data.id = `RET-2026-00${count + 1}`;

    const newReturn = await Return.create(data);

    data.items.forEach((item) => {
      const targetItem = invoice.items.find((invoiceItem) => invoiceItem.id === item.id);
      if (targetItem) {
        targetItem.returnedQty = (targetItem.returnedQty || 0) + item.qty;
      }
    });
    await invoice.save();

    return newReturn;
  }

  async updateReturnStatus(returnId, status) {
    await this.seedDefaultData();
    const updatedReturn = await Return.findOneAndUpdate(
      { id: returnId },
      { status },
      { returnDocument: "after" }
    );

    if (!updatedReturn) {
      throw new Error(`Return request with ID ${returnId} not found.`);
    }

    return updatedReturn;
  }
}

module.exports = new ReturnsService();
