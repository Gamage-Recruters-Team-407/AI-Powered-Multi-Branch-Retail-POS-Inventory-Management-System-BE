const User = require("../models/User");

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
      role,
      branch,
      isActive,
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
      role: role || "cashier",
      branch,
      isActive: isActive !== undefined ? isActive : true,
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
        role: user.role,
        branch: user.branch,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

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
      phone,
      role,
      branch,
      isActive,
      approvalStatus,
    } = req.body;

    const updateData = {};

    if (firstName) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (role) updateData.role = role;
    if (branch !== undefined) updateData.branch = branch;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (approvalStatus) {
      updateData.approvalStatus = approvalStatus;

      if (approvalStatus === "APPROVED") {
        updateData.approvedBy = req.user?._id || null;
        updateData.approvedAt = new Date();
      }

      if (approvalStatus === "PENDING" || approvalStatus === "REJECTED") {
        updateData.approvedBy = null;
        updateData.approvedAt = null;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    res.json({
      success: true,
      message: "User updated successfully",
      data: updatedUser,
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
        role: user.role,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus,
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
        role: user.role,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus,
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

const getManagers = async (req, res) => {
  try {
    const managers = await User.find({
      role: { $in: ["MANAGER", "manager"] },
      isActive: true,
      approvalStatus: { $in: ["APPROVED", null] },
    }).select("firstName lastName name");

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
      ],
    }).select("-password");

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