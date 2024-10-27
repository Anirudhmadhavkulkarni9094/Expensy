const mongoose = require("mongoose");

const SplitDetailSchema = new mongoose.Schema({
  userId: { type: String, required: false }, // Only for registered users
  name: { type: String, required: true },    // Name of the participant
  share: { type: Number, required: true },   // Split amount
  hasPaid: { type: Boolean, default: false } // Whether they have paid back
});

const ExpenseSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: Date, default:  Date.now() },
  description: { type: String },
  splitDetails: [SplitDetailSchema] // Optional field for split details
});

const Expense = mongoose.model("Expense", ExpenseSchema);
module.exports = Expense;
