const Product = require("../models/Product.js");
const cloudinary = require("../config/cloudinary");
const systemEvents = require("../events/eventBus.js");
const { isMongoConnected } = require("../middleware/requireMongoConnection");

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
            isActive
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

        const product = await Product.create({
            name,
            barcode,
            category,
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

        res.status(200).json({
            success: true,
            product
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

        product.name = req.body.name ?? product.name;
        product.barcode = req.body.barcode ?? product.barcode;
        product.category = req.body.category ?? product.category;
        product.supplier = req.body.supplier ?? product.supplier;
        product.brand = req.body.brand ?? product.brand;
        product.description = req.body.description ?? product.description;
        product.price = req.body.price ?? product.price;
        product.costPrice = req.body.costPrice ?? product.costPrice;
        product.reorderLevel = req.body.reorderLevel ?? product.reorderLevel;
        product.unit = req.body.unit ?? product.unit;
        product.isActive = req.body.isActive ?? product.isActive;
        product.image = imageUrl;
        product.imagePublicId = imagePublicId;

        const updatedProduct = await product.save();

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
    deactivateProduct,
    deleteProduct,
    getProductByBarcode,
    searchProducts,
    getActiveProducts,
    getInactiveProducts,
    reactivateProduct
};  