const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./src/config/db');

// Models
const Branch = require('./src/models/Branch');
const Customer = require('./src/models/Customer');
const Product = require('./src/models/Product');
const Sale = require('./src/models/Sale');
const Category = require('./src/models/Category');
const Inventory = require('./src/models/Inventory');

dotenv.config();

const seedData = async () => {
  try {
    await connectDB();
    console.log("Connected to MongoDB. Starting large ML data seed process...");

    // 1. Ensure a Branch exists
    let branch = await Branch.findOne({ name: "Main HQ" });
    if (!branch) {
        branch = await Branch.create({ name: "Main HQ", location: "Downtown", contactNumber: "555-0100" });
    }

    // 2. Seed Categories (10 categories)
    const categoryNames = [
        "Electronics", "Accessories", "Office Supplies", "Furniture", 
        "Networking", "Storage", "Audio", "Peripherals", 
        "Cables", "Components"
    ];
    
    const createdCategories = [];
    for (const name of categoryNames) {
        let cat = await Category.findOne({ name });
        if (!cat) {
            cat = await Category.create({ name, description: `${name} items` });
        }
        createdCategories.push(cat);
    }
    console.log(`✅ Seeded ${createdCategories.length} Categories`);

    // 3. Seed Customers (>50 customers)
    const createdCustomers = [];
    for (let i = 1; i <= 60; i++) {
        const first = `CustomerFirst${i}`;
        const last = `CustomerLast${i}`;
        const email = `customer${i}@example.com`;
        
        let cust = await Customer.findOne({ email });
        if (!cust) {
            cust = await Customer.create({
                firstName: first,
                lastName: last,
                email,
                phone: "555-" + Math.floor(1000 + Math.random() * 9000),
                preferredBranch: branch._id
            });
        }
        createdCustomers.push(cust);
    }
    console.log(`✅ Seeded ${createdCustomers.length} Customers`);

    // 4. Seed Products (>50 products)
    const createdProducts = [];
    for (let i = 1; i <= 70; i++) {
        const name = `ML Product ${i}`;
        const cat = createdCategories[Math.floor(Math.random() * createdCategories.length)];
        
        let prod = await Product.findOne({ name });
        if (!prod) {
            prod = await Product.create({
                name,
                barcode: "PROD_ML_" + (1000 + i),
                category: cat._id,
                price: Math.floor(Math.random() * 500) + 10,
                costPrice: Math.floor(Math.random() * 200) + 5,
                brand: "Generic ML",
                description: `A highly rated ${name} for ML testing`,
                reorderLevel: 10 + Math.floor(Math.random() * 10)
            });
        }
        createdProducts.push(prod);
    }
    console.log(`✅ Seeded ${createdProducts.length} Products`);

    // 5. Seed Inventory for those products
    let inventoryCount = 0;
    for (const prod of createdProducts) {
        let inv = await Inventory.findOne({ product: prod._id, branch: branch._id });
        if (!inv) {
            const qty = Math.floor(Math.random() * 100);
            await Inventory.create({
                product: prod._id,
                branch: branch._id,
                quantity: qty,
                lowStockAlert: qty < prod.reorderLevel
            });
            inventoryCount++;
        }
    }
    console.log(`✅ Seeded ${inventoryCount} Inventory Records`);

    // 0. Ensure a User (Cashier) exists
    const User = require('./src/models/User');
    let cashier = await User.findOne({});
    if (!cashier) {
        cashier = await User.create({
            firstName: "System",
            lastName: "Cashier",
            email: "cashier@example.com",
            password: "hashedpassword123",
            role: "Cashier",
            branch: branch._id
        });
    }

    // 6. Seed Sales/Transactions (>100 sales)
    let salesCount = 0;
    for (let i = 1; i <= 150; i++) {
        const randCust = createdCustomers[Math.floor(Math.random() * createdCustomers.length)];
        
        // Pick 1-5 random items
        const numItems = Math.floor(Math.random() * 5) + 1;
        const items = [];
        let total = 0;
        
        for (let j = 0; j < numItems; j++) {
            const randProd = createdProducts[Math.floor(Math.random() * createdProducts.length)];
            const qty = Math.floor(Math.random() * 3) + 1;
            const lineTotal = randProd.price * qty;
            items.push({
                product: randProd._id,
                name: randProd.name,
                quantity: qty,
                unitPrice: randProd.price,
                lineTotal: lineTotal,
                discount: 0
            });
            total += lineTotal;
        }

        // Random date within last 30 days
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - Math.floor(Math.random() * 30));

        await Sale.create({
            invoiceNumber: "INV-ML-" + Date.now() + "-" + i,
            customer: randCust._id,
            cashier: cashier._id,
            branch: branch._id,
            items: items,
            paymentMethod: "CARD",
            subtotal: total,
            totalAmount: total,
            taxAmount: total * 0.1,
            finalAmount: total * 1.1,
            createdAt: pastDate
        });
        salesCount++;
    }
    console.log(`✅ Seeded ${salesCount} Sales/Transactions`);

    console.log("🎉 ML Data Seeding Complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
};

seedData();
