const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./src/config/db');

// Models
const Branch = require('./src/models/Branch');
const Customer = require('./src/models/Customer');
const Product = require('./src/models/Product');
const Sale = require('./src/models/Sale');

dotenv.config();

const seedData = async () => {
  try {
    await connectDB();
    console.log("Connected to MongoDB. Starting seed process...");

    // Create a Branch
    let branch = await Branch.findOne({ name: "Main HQ" });
    if (!branch) {
        branch = await Branch.create({ name: "Main HQ", location: "Downtown", contactNumber: "555-0100" });
    }

    // Create Realistic Customers
    const customerNames = [
        ["Alice", "Johnson"], ["Bob", "Williams"], ["Charlie", "Brown"],
        ["Diana", "Prince"], ["Evan", "Wright"], ["Fiona", "Gallagher"],
        ["George", "Miller"], ["Hannah", "Abbott"], ["Ian", "Somerhalder"],
        ["Julia", "Roberts"]
    ];
    
    const createdCustomers = [];
    for (const [first, last] of customerNames) {
        const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
        let cust = await Customer.findOne({ email });
        if (!cust) {
            cust = await Customer.create({
                firstName: first,
                lastName: last,
                email,
                phone: "555-" + Math.floor(1000 + Math.random() * 9000),
                preferredBranch: branch._id
            });
            console.log(`Added customer: ${first} ${last}`);
        }
        createdCustomers.push(cust);
    }

    // Create Realistic Products
    const productsData = [
        { name: "Wireless Mouse", price: 25.99, costPrice: 10 },
        { name: "Mechanical Keyboard", price: 89.99, costPrice: 40 },
        { name: "USB-C Cable", price: 12.50, costPrice: 3 },
        { name: "Gaming Monitor", price: 299.99, costPrice: 200 },
        { name: "Ergonomic Chair", price: 150.00, costPrice: 80 },
        { name: "A4 Copy Paper", price: 5.99, costPrice: 2 },
        { name: "Blue Ink Pens (10 Pack)", price: 3.50, costPrice: 1 },
        { name: "Notebook", price: 4.99, costPrice: 1.5 },
        { name: "Desk Lamp", price: 22.00, costPrice: 10 },
        { name: "Bluetooth Speaker", price: 45.00, costPrice: 20 }
    ];

    const createdProducts = [];
    for (let i = 0; i < productsData.length; i++) {
        const p = productsData[i];
        let prod = await Product.findOne({ name: p.name });
        if (!prod) {
            prod = await Product.create({
                name: p.name,
                barcode: "PROD" + (1000 + i),
                price: p.price,
                costPrice: p.costPrice,
                brand: "Generic",
                description: `A high quality ${p.name}`
            });
            console.log(`Added product: ${p.name}`);
        }
        createdProducts.push(prod);
    }

    // Create Random Sales
    console.log("Generating 30 random sales to populate charts...");
    for (let i = 0; i < 30; i++) {
        const randCust = createdCustomers[Math.floor(Math.random() * createdCustomers.length)];
        
        // Pick 1-3 random items
        const numItems = Math.floor(Math.random() * 3) + 1;
        const items = [];
        let total = 0;
        
        for (let j = 0; j < numItems; j++) {
            const randProd = createdProducts[Math.floor(Math.random() * createdProducts.length)];
            const qty = Math.floor(Math.random() * 2) + 1;
            items.push({
                product: randProd._id,
                quantity: qty,
                price: randProd.price,
                discount: 0
            });
            total += randProd.price * qty;
        }

        await Sale.create({
            invoiceNumber: "INV-" + Date.now() + "-" + i,
            customer: randCust._id,
            branch: branch._id,
            items: items,
            paymentMethod: "CARD",
            totalAmount: total,
            taxAmount: total * 0.1,
            finalAmount: total * 1.1
        });
    }

    console.log("✅ Database successfully seeded with 10 Customers, 10 Products, and 30 Sales!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
};

seedData();
