const Invoice = require("../models/Invoice");
const Return = require("../models/Return");

// Mock default data matching App.jsx initial state
const initialInvoices = [
  {
    id: 'INV-2026-001',
    customer: 'Yasith Silva',
    branch: 'Colombo Main (HQ)',
    date: '2026-05-20',
    paymentMethod: 'Credit Card',
    items: [
      { id: 'PROD-101', name: 'iPad Pro 11-inch M4', qty: 1, price: 999.00, returnedQty: 0 },
      { id: 'PROD-102', name: 'Apple Pencil Pro', qty: 1, price: 129.00, returnedQty: 0 },
      { id: 'PROD-103', name: 'Paperlike Screen Protector', qty: 2, price: 39.99, returnedQty: 1 }
    ],
    taxRate: 0.12,
    discountAmount: 50.00
  },
  {
    id: 'INV-2026-002',
    customer: 'Malmi Shehara',
    branch: 'Kandy City Mall',
    date: '2026-04-10', 
    paymentMethod: 'Cash',
    items: [
      { id: 'PROD-201', name: 'MacBook Air M3', qty: 1, price: 1099.00, returnedQty: 0 },
      { id: 'PROD-202', name: 'Apple Magic Mouse', qty: 1, price: 79.00, returnedQty: 0 }
    ],
    taxRate: 0.08,
    discountAmount: 0.00
  },
  {
    id: 'INV-2026-003',
    customer: 'Gavesha Thathsarani',
    branch: 'Galle Harbour Rd',
    date: '2026-05-29', 
    paymentMethod: 'Digital Wallet',
    items: [
      { id: 'PROD-301', name: 'Sony WH-1000XM5 Headphones', qty: 1, price: 399.00, returnedQty: 0 },
      { id: 'PROD-302', name: 'Anker USB-C Hub 7-in-1', qty: 2, price: 49.99, returnedQty: 0 }
    ],
    taxRate: 0.10,
    discountAmount: 20.00
  }
];

const initialReturns = [
  {
    id: 'RET-2026-001',
    invoiceId: 'INV-2026-001',
    customer: 'Dave Smith',
    branch: 'Colombo Main (HQ)',
    date: '2026-05-22',
    amount: 44.79, 
    status: 'Refunded',
    reason: 'Defective item',
    condition: 'Damaged (Write-off)',
    items: [
      { id: 'PROD-103', name: 'Paperlike Screen Protector', qty: 1, price: 39.99 }
    ]
  },
  {
    id: 'RET-2026-002',
    invoiceId: 'INV-2026-003',
    customer: 'John Doe',
    branch: 'Galle Harbour Rd',
    date: '2026-06-01',
    amount: 109.98,
    status: 'Pending Approval',
    reason: 'Wrong item shipped',
    condition: 'Resellable (Restock)',
    items: [
      { id: 'PROD-302', name: 'Anker USB-C Hub 7-in-1', qty: 2, price: 49.99 }
    ]
  }
];

class ReturnsService {
    // Seed default data if database collections are empty
    async seedDefaultData() {
        try {
            const invoiceCount = await Invoice.countDocuments();
            if (invoiceCount === 0) {
                await Invoice.insertMany(initialInvoices);
                console.log("✅ Seeded initial invoices data");
            }
            const returnsCount = await Return.countDocuments();
            if (returnsCount === 0) {
                await Return.insertMany(initialReturns);
                console.log("✅ Seeded initial returns data");
            }
        } catch (error) {
            console.error("❌ Failed to seed returns/invoices default data:", error.message);
        }
    }

    async getAllInvoices() {
        await this.seedDefaultData();
        return await Invoice.find({}).sort({ createdAt: -1 });
    }

    async getInvoiceById(invoiceId) {
        await this.seedDefaultData();
        return await Invoice.findOne({ id: invoiceId });
    }

    async getAllReturns() {
        await this.seedDefaultData();
        return await Return.find({}).sort({ createdAt: -1 });
    }

    async createReturn(data) {
        await this.seedDefaultData();

        // 1. Find the target invoice
        const invoice = await Invoice.findOne({ id: data.invoiceId });
        if (!invoice) {
            throw new Error(`Invoice with ID ${data.invoiceId} not found.`);
        }

        // Generate return ID dynamically based on count
        const count = await Return.countDocuments();
        const newReturnId = `RET-2026-00${count + 1}`;
        data.id = newReturnId;

        // 2. Create the return entry
        const newReturn = await Return.create(data);

        // 3. Update returned quantities on the invoice items
        data.items.forEach(item => {
            const targetItem = invoice.items.find(invItem => invItem.id === item.id);
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
            { returnDocument: 'after' }
        );
        if (!updatedReturn) {
            throw new Error(`Return request with ID ${returnId} not found.`);
        }
        return updatedReturn;
    }
}

module.exports = new ReturnsService();
