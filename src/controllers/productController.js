const Product = require("../models/Product.js");
const cloudinary = require("../config/cloudinary");
const systemEvents = require("../events/eventBus.js");
const { isMongoConnected } = require("../middleware/requireMongoConnection");
const Category = require("../models/Category.js");
const Branch = require("../models/Branch.js");
const Inventory = require("../models/Inventory.js");

// ─────────────────────────────────────────────
// HELPER: Product Management eken stock update kalama
// Inventory (branch-level) records update karanawa.
// Warehouse stock view already Inventory totals aggregate karanawa
// ─────────────────────────────────────────────
const syncInventoryFromProductUpdate = async (productId, quantity, branch, reorderLevel) => {
    try {
        if (quantity === undefined || quantity === null || quantity === "") return;
        const qty = Number(quantity);
        const reorder = Number(reorderLevel) || 0;

        if (branch && branch !== "all" && branch !== "") {
            // Specific branch eke quantity update karanawa
            let inv = await Inventory.findOne({ product: productId, branch });
            if (inv) {
                inv.quantity = qty;
                inv.lowStockAlert = qty <= reorder;
                await inv.save();
            } else {
                await Inventory.create({
                    product: productId,
                    branch,
                    quantity: qty,
                    reservedStock: 0,
                    lowStockAlert: qty <= reorder
                });
            }
        } else {
            // "all" branches — all branches walata same quantity set karanawa
            const branches = await Branch.find({});
            for (const b of branches) {
                let inv = await Inventory.findOne({ product: productId, branch: b._id });
                if (inv) {
                    inv.quantity = qty;
                    inv.lowStockAlert = qty <= reorder;
                    await inv.save();
                } else {
                    await Inventory.create({
                        product: productId,
                        branch: b._id,
                        quantity: qty,
                        reservedStock: 0,
                        lowStockAlert: qty <= reorder
                    });
                }
            }
        }
    } catch (err) {
        console.error("syncInventoryFromProductUpdate error:", err.message);
    }
};

// Add Product
const addProduct = async (req, res) => {
    try {
        const {
            name,
            barcode,
            category,
            supplier,
            brand,
            description,
            price,
            costPrice,
            reorderLevel,
            unit,
            isActive,
            quantity,
            branch
        } = req.body;

        if (!name || !price) {
            return res.status(400).json({
                success: false,
                message: "Product name and price are required"
            });
        }

        if (barcode) {
            const existingProduct = await Product.findOne({ barcode });

            if (existingProduct) {
                return res.status(400).json({
                    success: false,
                    message: "This barcode already exists"
                });
            }
        }

        let imageUrl = "";
        let imagePublicId = "";

        if (req.file) {
            const base64Image = req.file.buffer.toString("base64");
            const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;

            if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_CLOUD_NAME) {
                try {
                    const uploadedImage = await cloudinary.uploader.upload(dataURI, {
                        folder: "retail_pos_products"
                    });
                    imageUrl = uploadedImage.secure_url;
                    imagePublicId = uploadedImage.public_id;
                } catch (uploadErr) {
                    console.error("Cloudinary upload failed, falling back to base64 Data URI:", uploadErr.message);
                    imageUrl = dataURI;
                }
            } else {
                console.log("Cloudinary credentials not configured. Using base64 Data URI fallback.");
                imageUrl = dataURI;
            }
        }

        let categoryName = "";

        if (category) {
            const selectedCategory = await Category.findById(category);

            if (!selectedCategory) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid category selected"
                });
            }

            categoryName = selectedCategory.name;
        }

        const product = await Product.create({
            name,
            barcode,
            category,
            categoryName,
            supplier,
            brand,
            description,
            price,
            costPrice,
            image: imageUrl,
            imagePublicId,
            reorderLevel,
            unit,
            isActive
        });

    
        try {
            const branches = await Branch.find({});
            if (branches && branches.length > 0) {
                const initQty = Number(quantity) || 0;
                const inventoryEntries = branches.map(b => {
                    let qtyForThisBranch = initQty;
                    if (branch && branch !== "all" && branch !== "") {
                        qtyForThisBranch = b._id.toString() === branch.toString() ? initQty : 0;
                    }
                    return {
                        product: product._id,
                        branch: b._id,
                        quantity: qtyForThisBranch,
                        reservedStock: 0,
                        lowStockAlert: qtyForThisBranch < 50
                    };
                });
                await Inventory.insertMany(inventoryEntries);
            }
        } catch (invErr) {
            console.error("Error creating initial inventory records for branches:", invErr.message);
        }


        try {
            const Warehouse = require("../models/Warehouse");
            const WarehouseZone = require("../models/WarehouseZone");
            const WarehouseStock = require("../models/WarehouseStock");
            const WarehouseTransaction = require("../models/WarehouseTransaction");

            let warehouse = await Warehouse.findOne({ isMain: true, isActive: true });
            if (!warehouse) {
                warehouse = await Warehouse.findOne({ isActive: true });
            }
            if (warehouse) {
                let zone = await WarehouseZone.findOne({ warehouse: warehouse._id, isActive: true });
                if (!zone) {
                    zone = await WarehouseZone.create({
                        warehouse: warehouse._id,
                        zoneName: "Default Zone",
                        zoneCode: "DEFAULT",
                        capacity: 10000,
                        currentStock: 0,
                        isActive: true
                    });
                }

                const initQty = Number(quantity) || 0;

                await WarehouseStock.create({
                    warehouse: warehouse._id,
                    zone: zone._id,
                    product: product._id,
                    quantity: initQty
                });

                if (initQty > 0) {
                    zone.currentStock = Math.max(0, zone.currentStock + initQty);
                    await zone.save();

                    await WarehouseTransaction.create({
                        warehouse: warehouse._id,
                        zone: zone._id,
                        product: product._id,
                        type: "IN",
                        quantity: initQty,
                        reference: "PRODUCT_CREATION",
                        note: `Initial stock from product registration: ${name}`
                    });
                }
                console.log(`Warehouse stock initialized for product ${product._id}: ${initQty} units in zone ${zone.zoneName}`);
            }
        } catch (whErr) {
            console.error("Error creating initial warehouse stock record:", whErr.message);
        }

        systemEvents.emit("SEND_ALERT", {
            target: { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"] },
            category: "INVENTORY",
            type: "INFO",
            title: "New Product Added",
            message: `${name} has been added to the product catalog.`,
            channels: ["in-app", "email"]
        });

        res.status(201).json({
            success: true,
            message: "Product added successfully",
            product
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error adding product",
            error: error.message
        });
    }
};


// Get All Products
const getAllProducts = async (req, res) => {
    try {
        if (!isMongoConnected()) {
            return res.status(200).json({ success: true, count: 0, products: [] });
        }

        const products = await Product.find()
            .populate("category")
            .populate("supplier")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching products",
            error: error.message
        });
    }
};

// Get Single Product
const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate("category")
            .populate("supplier");

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Inventory stock info also include karanawa
        const inventoryRecords = await Inventory.find({ product: req.params.id })
            .populate("branch", "name");

        const totalStock = inventoryRecords.reduce((sum, inv) => sum + (inv.quantity || 0), 0);

        res.status(200).json({
            success: true,
            product,
            inventory: {
                totalStock,
                byBranch: inventoryRecords.map(inv => ({
                    branch: inv.branch,
                    quantity: inv.quantity,
                    reservedStock: inv.reservedStock,
                    lowStockAlert: inv.lowStockAlert
                }))
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching product",
            error: error.message
        });
    }
};

// Update Product
// quantity & branch fields use karala Inventory sync karanawa.
// Warehouse stock view already Inventory totals aggregate karanawa → auto reflect.
const updateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        if (req.body.barcode && req.body.barcode !== product.barcode) {
            const existingProduct = await Product.findOne({
                barcode: req.body.barcode,
                _id: { $ne: req.params.id }
            });

            if (existingProduct) {
                return res.status(400).json({
                    success: false,
                    message: "This barcode already exists"
                });
            }
        }

        let imageUrl = product.image;
        let imagePublicId = product.imagePublicId;

        if (req.file) {
            if (product.imagePublicId) {
                await cloudinary.uploader.destroy(product.imagePublicId);
            }

            const base64Image = req.file.buffer.toString("base64");
            const dataURI = `data:${req.file.mimetype};base64,${base64Image}`;

            if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_CLOUD_NAME) {
                try {
                    const uploadedImage = await cloudinary.uploader.upload(dataURI, {
                        folder: "retail_pos_products"
                    });
                    imageUrl = uploadedImage.secure_url;
                    imagePublicId = uploadedImage.public_id;
                } catch (uploadErr) {
                    console.error("Cloudinary upload failed, falling back to base64 Data URI:", uploadErr.message);
                    imageUrl = dataURI;
                }
            } else {
                console.log("Cloudinary credentials not configured. Using base64 Data URI fallback.");
                imageUrl = dataURI;
            }
        }

        let categoryName = product.categoryName;

        if (req.body.category) {
            const selectedCategory = await Category.findById(req.body.category);

            if (!selectedCategory) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid category selected"
                });
            }

            categoryName = selectedCategory.name;
        }

        const newReorderLevel = req.body.reorderLevel ?? product.reorderLevel;

        product.name = req.body.name ?? product.name;
        product.barcode = req.body.barcode ?? product.barcode;
        product.category = req.body.category ?? product.category;
        product.categoryName = categoryName;
        product.supplier = req.body.supplier ?? product.supplier;
        product.brand = req.body.brand ?? product.brand;
        product.description = req.body.description ?? product.description;
        product.price = req.body.price ?? product.price;
        product.costPrice = req.body.costPrice ?? product.costPrice;
        product.reorderLevel = newReorderLevel;
        product.unit = req.body.unit ?? product.unit;
        product.isActive = req.body.isActive ?? product.isActive;
        product.image = imageUrl;
        product.imagePublicId = imagePublicId;

        const updatedProduct = await product.save();

        // ── Inventory Sync ──────────────────────────────────────────
        // Product management eken quantity update kalama,
        // Inventory (branch-level) records update karanawa.
        // Warehouse stock view already Inventory aggregate karanawa → auto reflect.
        if (req.body.quantity !== undefined && req.body.quantity !== null && req.body.quantity !== "") {
            await syncInventoryFromProductUpdate(
                updatedProduct._id,
                req.body.quantity,
                req.body.branch,
                newReorderLevel
            );
        }
        // ────────────────────────────────────────────────────────────

        systemEvents.emit("SEND_ALERT", {
            target: { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"] },
            category: "INVENTORY",
            type: "INFO",
            title: "Product Updated",
            message: `Product "${updatedProduct.name}" details have been updated.`,
            channels: ["in-app", "email"]
        });

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product: updatedProduct
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating product",
            error: error.message
        });
    }
};

// Update Product Stock Only (dedicated endpoint)
// PUT /api/products/:id/stock
const updateProductStock = async (req, res) => {
    try {
        const { quantity, branch } = req.body;

        if (quantity === undefined || quantity === null) {
            return res.status(400).json({ success: false, message: "quantity is required" });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        await syncInventoryFromProductUpdate(
            product._id,
            quantity,
            branch,
            product.reorderLevel
        );

        // Updated totals return karanawa
        const inventoryRecords = await Inventory.find({ product: product._id });
        const totalStock = inventoryRecords.reduce((sum, inv) => sum + (inv.quantity || 0), 0);

        systemEvents.emit("SEND_ALERT", {
            target: { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
            category: "INVENTORY",
            type: "INFO",
            title: "Stock Updated",
            message: `Stock for "${product.name}" updated to ${quantity} units${branch && branch !== "all" ? " (specific branch)" : " (all branches)"}.`,
            channels: ["in-app"]
        });

        res.status(200).json({
            success: true,
            message: "Stock updated successfully",
            totalStock,
            product: product.name
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating stock", error: error.message });
    }
};

// Deactivate Product
const deactivateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        product.isActive = false;

        const updatedProduct = await product.save();

        systemEvents.emit('SEND_ALERT', {
            target: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER'] }, 
            category: 'INVENTORY',
            type: 'WARNING',
            title: 'Product Deactivated',
            message: `Product "${updatedProduct.name}" has been deactivated.`,
            channels: ['in-app', 'email']
        });

        res.status(200).json({
            success: true,
            message: "Product deactivated successfully",
            product: updatedProduct
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deactivating product",
            error: error.message
        });
    }
};

// Delete Product Permanently
const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        if (product.imagePublicId) {
            await cloudinary.uploader.destroy(product.imagePublicId);
        }

        await Product.findByIdAndDelete(req.params.id);

        systemEvents.emit("SEND_ALERT", {
            target: { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"] },
            category: "INVENTORY",
            type: "WARNING",
            title: "Product Deleted",
            message: `Product "${product.name}" has been permanently deleted from the catalog.`,
            channels: ["in-app", "email"]
        });

        res.status(200).json({
            success: true,
            message: "Product and image deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting product",
            error: error.message
        });
    }
};

// Get Product By Barcode
const getProductByBarcode = async (req, res) => {
    try {
        const product = await Product.findOne({
            barcode: req.params.barcode,
            isActive: true
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found for this barcode"
            });
        }

        res.status(200).json({
            success: true,
            product
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error finding product by barcode",
            error: error.message
        });
    }
};

// Search and Filter Products
const searchProducts = async (req, res) => {
    try {
        const { keyword, brand, category, supplier, minPrice, maxPrice } = req.query;

        let query = {
            isActive: true
        };

        if (keyword) {
            query.$or = [
                { name: { $regex: keyword, $options: "i" } },
                { barcode: { $regex: keyword, $options: "i" } },
                { brand: { $regex: keyword, $options: "i" } }
            ];
        }

        if (brand) {
            query.brand = { $regex: brand, $options: "i" };
        }

        if (category) {
            query.category = category;
        }

        if (supplier) {
            query.supplier = supplier;
        }

        if (minPrice || maxPrice) {
            query.price = {};

            if (minPrice) {
                query.price.$gte = Number(minPrice);
            }

            if (maxPrice) {
                query.price.$lte = Number(maxPrice);
            }
        }

        const products = await Product.find(query)
            .populate("category")
            .populate("supplier")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error searching products",
            error: error.message
        });
    }
};

// Get Active Products
const getActiveProducts = async (req, res) => {
    try {
        const products = await Product.find({ isActive: true })
            .populate("category")
            .populate("supplier")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching active products",
            error: error.message
        });
    }
};


// Get Inactive Products
const getInactiveProducts = async (req, res) => {
    try {
        const products = await Product.find({ isActive: false })
            .populate("category")
            .populate("supplier")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching inactive products",
            error: error.message
        });
    }
};


// Reactivate Product
const reactivateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        product.isActive = true;

        const updatedProduct = await product.save();

        systemEvents.emit('SEND_ALERT', {
            target: { roles: ['Admin', 'Manager', 'Cashier'] }, 
            category: 'INVENTORY',
            type: 'INFO',
            title: 'Product Reactivated',
            message: `Product "${updatedProduct.name}" has been reactivated.`,
            channels: ['in-app', 'email']
        });

        res.status(200).json({
            success: true,
            message: "Product reactivated successfully",
            product: updatedProduct
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error reactivating product",
            error: error.message
        });
    }
};

module.exports = {
    addProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    updateProductStock,
    deactivateProduct,
    deleteProduct,
    getProductByBarcode,
    searchProducts,
    getActiveProducts,
    getInactiveProducts,
    reactivateProduct
};
