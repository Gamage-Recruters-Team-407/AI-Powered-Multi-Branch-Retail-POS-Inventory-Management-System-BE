const Category = require("../models/Category.js");

// Add Category
const addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Category name is required"
            });
        }

        const existingCategory = await Category.findOne({ name });

        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: "Category already exists"
            });
        }

        const category = await Category.create({
            name,
            description
        });

        res.status(201).json({
            success: true,
            message: "Category added successfully",
            category
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error adding category",
            error: error.message
        });
    }
};

// Get All Categories
const getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: categories.length,
            categories
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching categories",
            error: error.message
        });
    }
};

// Get Single Category
const getCategoryById = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        res.status(200).json({
            success: true,
            category
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching category",
            error: error.message
        });
    }
};

// Update Category
const updateCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        category.name = req.body.name;
        category.description = req.body.description;

        const updatedCategory = await category.save();

        res.status(200).json({
            success: true,
            message: "Category updated successfully",
            category: updatedCategory
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating category",
            error: error.message
        });
    }
};

// Delete Category
const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        await Category.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "Category deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting category",
            error: error.message
        });
    }
};

module.exports = {
    addCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory
};