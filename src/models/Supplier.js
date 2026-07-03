const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Transaction ID is required']
  },
  date: {
    type: String,
    required: [true, 'Transaction date is required']
  },
  itemsCount: {
    type: Number,
    required: [true, 'Transaction items count is required']
  },
  amount: {
    type: Number,
    required: [true, 'Transaction amount is required']
  },
  status: {
    type: String,
    enum: {
      values: ['Delivered', 'Pending', 'Cancelled'],
      message: '{VALUE} is not a valid transaction status'
    },
    required: [true, 'Transaction status is required']
  }
}, { _id: false });

const contractSchema = new mongoose.Schema({
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  status: {
    type: String,
    enum: {
      values: ['Active', 'Expired', 'Terminated', 'Under Negotiation'],
      message: '{VALUE} is not a valid contract status'
    },
    default: 'Under Negotiation'
  },
  terms: {
    type: String
  },
  paymentTerms: {
    type: String
  },
  sla: {
    type: String
  }
}, { _id: false });

const performanceSchema = new mongoose.Schema({
  onTimeDelivery: {
    type: Number,
    min: 0,
    max: 100,
    default: 95
  },
  qualityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 95
  },
  leadTimeDays: {
    type: Number,
    default: 3
  },
  returnRate: {
    type: Number,
    default: 0.0
  }
}, { _id: false });

const supplierSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: [true, 'Company name is required']
    },

    contactPerson: {
      type: String,
      required: [true, 'Contact person is required']
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required']
    },

    address: {
      type: String,
      required: [true, 'Address is required']
    },

    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: [
          'Grains & Rice',
          'Beverages',
          'Dairy Products',
          'Spices & Condiments',
          'Packaging Materials',
          'Fresh Produce',
          'Meat & Seafood',
          'Other'
        ],
        message: '{VALUE} is not a valid category'
      }
    },

    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: {
        values: ['Active', 'Under Review', 'Inactive'],
        message: '{VALUE} is not a valid status'
      },
      default: 'Active'
    },

    rating: {
      type: Number,
      default: 5.0
    },

    totalSpend: {
      type: Number,
      default: 0
    },

    performance: {
      type: performanceSchema,
      default: () => ({})
    },

    contract: {
      type: contractSchema,
      default: () => ({})
    },

    aiRecommendation: {
      type: String
    },

    transactions: {
      type: [transactionSchema],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

module.exports = mongoose.model("Supplier", supplierSchema);