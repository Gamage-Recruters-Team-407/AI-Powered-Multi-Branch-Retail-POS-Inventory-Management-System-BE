const Sale = require("../models/Sale");
const Forecast = require("../models/Forecast");
const Product = require("../models/Product");
const Branch = require("../models/Branch");

const fs = require("fs");
const path = require("path");

const { PythonShell } = require("python-shell");

const createObjectCsvWriter =
require("csv-writer").createObjectCsvWriter;

exports.generateForecast = async () => {
    try {
        const csvPath = path.join(__dirname, "../ai/sales_data.csv");
        
        // ─── Detect sales_data.csv and Seed Database if Empty ────────────────
        const salesCount = await Sale.countDocuments();
        if (salesCount === 0 && fs.existsSync(csvPath)) {
            console.log("Detecting empty database and existing sales_data.csv...");
            const csvContent = fs.readFileSync(csvPath, "utf-8");
            
            if (csvContent.includes("GAMAGE POS RETAIL SYSTEM") || csvContent.includes("REPORT ID,BRANCH")) {
                console.log("Parsing raw sales report from sales_data.csv for database seeding...");
                const lines = csvContent.split(/\r?\n/);
                let dataStartIndex = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith("REPORT ID")) {
                        dataStartIndex = i;
                        break;
                    }
                }
                
                if (dataStartIndex !== -1) {
                    // Ensure a default product exists
                    let defaultProduct = await Product.findOne({ name: "Default Product" });
                    if (!defaultProduct) {
                        defaultProduct = await Product.create({
                            name: "Default Product",
                            sku: "PROD-DEFAULT",
                            price: 100,
                            stock: 500,
                            category: "General"
                        });
                        console.log("Created default Product for seeding.");
                    }
                    
                    const salesToInsert = [];
                    const seenInvoices = new Set();
                    
                    for (let i = dataStartIndex + 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        const parts = line.split(",");
                        if (parts.length < 6) continue;
                        
                        const [reportId, branchName, cashierType, dateStr, amountStr, status] = parts;
                        
                        if (status.trim() !== "COMPLETED") continue;
                        
                        const amount = parseFloat(amountStr);
                        if (isNaN(amount)) continue;
                        
                        const reportIdClean = reportId.trim();
                        if (seenInvoices.has(reportIdClean)) continue;
                        seenInvoices.add(reportIdClean);
                        
                        // Get or create branch
                        const branchNameClean = branchName.trim();
                        let branch = await Branch.findOne({ name: branchNameClean });
                        if (!branch) {
                            const code = branchNameClean.split(" ").map(w => w[0]).join("").toUpperCase() + "001";
                            branch = await Branch.create({
                                name: branchNameClean,
                                code: code,
                                isActive: true
                            });
                            console.log(`Created Branch: ${branchNameClean}`);
                        }
                        
                        // Parse date format M/D/YYYY
                        const dateParts = dateStr.split("/");
                        let dateVal;
                        if (dateParts.length === 3) {
                            const month = parseInt(dateParts[0]) - 1;
                            const day = parseInt(dateParts[1]);
                            const year = parseInt(dateParts[2]);
                            dateVal = new Date(Date.UTC(year, month, day, 12, 0, 0));
                        } else {
                            dateVal = new Date(dateStr);
                        }
                        
                        if (isNaN(dateVal.getTime())) {
                            dateVal = new Date();
                        }
                        
                        salesToInsert.push({
                            invoiceNumber: reportIdClean,
                            branch: branch._id,
                            items: [
                                {
                                    product: defaultProduct._id,
                                    quantity: 1,
                                    price: amount,
                                    discount: 0
                                }
                            ],
                            paymentMethod: "CASH",
                            totalAmount: amount,
                            taxAmount: 0,
                            finalAmount: amount,
                            createdAt: dateVal,
                            updatedAt: dateVal
                        });
                    }
                    
                    if (salesToInsert.length > 0) {
                        console.log(`Inserting ${salesToInsert.length} sale records into MongoDB...`);
                        await Sale.insertMany(salesToInsert);
                        console.log("Database successfully seeded from sales_data.csv");
                    }
                }
            }
        }

        // ─── Generate Clean sales_data.csv for Prophet ────────────────────────
        const sales = await Sale.find()
            .populate("branch")
            .populate("items.product");

        const records = [];

        sales.forEach((sale) => {
            if (!sale.branch || !sale.items) return;
            sale.items.forEach((item) => {
                if (!item.product) return;
                records.push({
                    date: sale.createdAt.toISOString().split("T")[0],
                    productId: item.product._id.toString(),
                    branchId: sale.branch._id.toString(),
                    quantitySold: item.quantity
                });
            });
        });

        if (records.length === 0) {
            console.warn("No sales data available to generate forecast.");
            return;
        }

        const csvWriter = createObjectCsvWriter({
            path: csvPath,
            header: [
                { id: "date", title: "date" },
                { id: "productId", title: "productId" },
                { id: "branchId", title: "branchId" },
                { id: "quantitySold", title: "quantitySold" }
            ]
        });

        await csvWriter.writeRecords(records);

        // ─── Run Python Prophet Forecast ─────────────────────────────────────
        const options = {
            mode: "text",
            pythonPath: "python",
            scriptPath: path.join(__dirname, "../ai"),
            args: []
        };

        PythonShell.run("forecast.py", options)
            .then(async (results) => {
                const parsedResults = JSON.parse(results[0]);

                await Forecast.deleteMany();
                await Forecast.insertMany(parsedResults);

                console.log("Forecast generated successfully");
                global.io.emit("forecastUpdated", parsedResults);
            })
            .catch((err) => {
                console.error("Python shell forecast error:", err);
            });

    } catch (error) {
        console.error("Error in generateForecast service:", error);
    }
};