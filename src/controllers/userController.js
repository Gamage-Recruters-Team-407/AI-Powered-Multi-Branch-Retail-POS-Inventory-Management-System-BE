const User = require("../models/User");
const bcrypt = require("bcryptjs");

const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select("-password")
      .populate("branch", "name");

    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("branch", "name");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const {
      name,
      firstName,
      lastName,
      email,
      password,
      phone,
      address,
      role,
      branch,
      isActive,
      salary,
      joiningDate,
      workingStatus,
      performanceScore,
    } = req.body;

    const finalFirstName = firstName || name?.split(" ")[0] || "";
    const finalLastName = lastName || name?.split(" ").slice(1).join(" ") || "";

    if (!finalFirstName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const user = await User.create({
      firstName: finalFirstName,
      lastName: finalLastName,
      name: `${finalFirstName} ${finalLastName}`.trim(),
      email: normalizedEmail,
      password,
      phone,
      address,
      role: role || "cashier",
      branch,
      isActive: isActive !== undefined ? isActive : true,

      // Employee fields
      salary: salary !== undefined ? salary : 0,
      joiningDate,
      workingStatus: workingStatus || "Off Duty",
      performanceScore:
        performanceScore !== undefined ? performanceScore : 0.0,

      // Admin-created users should be approved automatically
      approvalStatus: "APPROVED",
      approvedBy: req.user?._id || null,
      approvedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        branch: user.branch,
        isActive: user.isActive,
        salary: user.salary,
        joiningDate: user.joiningDate,
        workingStatus: user.workingStatus,
        performanceScore: user.performanceScore,
        approvalStatus: user.approvalStatus,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const {
      firstName,
      lastName,
      name,
      email,
      password,
      phone,
      address,
      role,
      branch,
      isActive,
      salary,
      joiningDate,
      workingStatus,
      performanceScore,
      approvalStatus,
    } = req.body;

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      const existingEmailUser = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.params.id },
      });

      if (existingEmailUser) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }

      user.email = normalizedEmail;
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (name !== undefined) user.name = name;

    if (!name && (firstName !== undefined || lastName !== undefined)) {
      user.name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }

    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (role !== undefined) user.role = role;
    if (branch !== undefined) user.branch = branch;
    if (isActive !== undefined) user.isActive = isActive;

    // Employee fields
    if (salary !== undefined) user.salary = salary;
    if (joiningDate !== undefined) user.joiningDate = joiningDate;
    if (workingStatus !== undefined) user.workingStatus = workingStatus;
    if (performanceScore !== undefined) user.performanceScore = performanceScore;

    // Password update safely hash manually
    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    // Approval status update
    if (approvalStatus) {
      user.approvalStatus = approvalStatus;

      if (approvalStatus === "APPROVED") {
        user.approvedBy = req.user?._id || null;
        user.approvedAt = new Date();
        user.isActive = true;
      }

      if (approvalStatus === "PENDING" || approvalStatus === "REJECTED") {
        user.approvedBy = null;
        user.approvedAt = null;
      }
    }

    const updatedUser = await user.save({ validateBeforeSave: true });

    res.json({
      success: true,
      message: "User updated successfully",
      data: {
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: updatedUser.address,
        role: updatedUser.role,
        branch: updatedUser.branch,
        isActive: updatedUser.isActive,
        salary: updatedUser.salary,
        joiningDate: updatedUser.joiningDate,
        workingStatus: updatedUser.workingStatus,
        performanceScore: updatedUser.performanceScore,
        approvalStatus: updatedUser.approvalStatus,
        approvedBy: updatedUser.approvedBy,
        approvedAt: updatedUser.approvedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const approveUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.approvalStatus = "APPROVED";
    user.isActive = true;
    user.approvedBy = req.user?._id || null;
    user.approvedAt = new Date();

    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: "User approved successfully",
      data: {
        _id: user._id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        branch: user.branch,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.approvalStatus = "REJECTED";
    user.approvedBy = null;
    user.approvedAt = null;

    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: "User rejected successfully",
      data: {
        _id: user._id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        branch: user.branch,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await user.deleteOne();

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Get all managers for dropdowns
const getManagers = async (req, res) => {
  try {
    const managers = await User.find({
      role: { $in: ["MANAGER", "manager"] },
      isActive: true,
      approvalStatus: { $in: ["APPROVED", null] },
    }).select("firstName lastName name email");

    res.status(200).json({
      success: true,
      data: managers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const searchUsers = async (req, res) => {
  try {
    const q = req.query.q || "";

    const users = await User.find({
      $or: [
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { role: { $regex: q, $options: "i" } },
        { approvalStatus: { $regex: q, $options: "i" } },
      ],
    })
      .sort({ createdAt: -1 })
      .select("-password");

    res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Search failed",
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  approveUser,
  rejectUser,
  deleteUser,
  searchUsers,
  getManagers,
};