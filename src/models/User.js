const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName:  String,

    name: String,

    email: {
      type:     String,
      required: true,
      unique:   true,
    },

    password: {
      type:     String,
      required: true,
    },

    phone: String,

    role: {
        type: String,
        enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'EMPLOYEE',
                'admin', 'manager', 'cashier', 'user'],  // ✅ 'user' add
        default: 'user',
        uppercase: false,
        },

    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Branch',
    },

    isActive: {
      type:    Boolean,
      default: true,
    },

    // Password Reset fields
    resetPasswordToken:  String,
    resetPasswordExpire: Date,

    lastLogin: Date,
  },
  { timestamps: true },
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);