const express = require("express");
const Expense = require("../models/Expense");
const { Parser } = require("json2csv");
const authMiddleware = require("../middleware/auth");
const router = express.Router();

router.post("/add", authMiddleware, async (req, res) => {
  try {
    const { amount, category, date, description, splitWith } = req.body;

    // Calculate the number of participants (including the main user)
    const totalParticipants = splitWith && splitWith.length > 0 ? splitWith.length + 1 : 1;
    const splitAmount = amount / totalParticipants;

    // Prepare split details for each participant
    let splitDetails = [];

    if (splitWith && splitWith.length > 0) {
      splitDetails = splitWith.map((person) => ({
        userId: person.userId || null,        // Add userId if available (for registered users)
        name: person.name || "Anonymous",     // Name of the participant or default "Anonymous"
        share: splitAmount,                   // Equal share of the total expense
        hasPaid: false                        // Default to unpaid
      }));
    }

    // Add main user as part of split details
    splitDetails.push({
      userId: req.user.userId,               // Main user's ID from JWT
      name: req.user.name || "You",          // Use "You" or fetch main user's name if available
      share: splitAmount,
      hasPaid: true                          // Main user doesn't owe themselves
    });

    // Create the expense document
    const expense = new Expense({
      userId: req.user.userId,               // Main user ID
      amount,
      category,
      date,
      description,
      splitDetails                            // Include all split details
    });

    // Save the expense document to the database
    await expense.save();
    res.status(201).json(expense);

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to add expense" });
  }
});

router.put("/update-status", authMiddleware, async (req, res) => {
  const { expenseId, detailIndex, hasPaid } = req.body;
  try {
    const expense = await Expense.findById(expenseId);
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    const participant = expense.splitDetails[detailIndex];
    if (participant.hasPaid === hasPaid) {
      return res.status(400).json({ error: "Status already updated" });
    }

    if (hasPaid) {
      expense.amountLeftToBePaid -= participant.share;
      expense.amount -= participant.share;
    } 
    else{
      expense.amount = Number(expense.amount) + Number(participant.share)
    }
    
    participant.hasPaid = hasPaid;
    await expense.save();

    res.json({ message: "Payment status updated", expense });
  } catch (error) {
    res.status(500).json({ error: "Failed to update payment status" });
  }
});


// Fetch expenses for the logged-in user (protected)
router.get("/fetch", authMiddleware, async (req, res) => {
  try {
    // Find all expenses where the userId matches the logged-in user's ID
    const expenses = await Expense.find({ userId: req.user.userId });

    // Calculate total amount spent by the user
    const totalAmountSpent = expenses.reduce((total, expense) => total + expense.amount, 0);

    // Calculate the total amount left to be paid and by each individual
    let totalAmountLeftToBePaid = 0;
    const individualBalances = {};

    expenses.forEach(expense => {
      expense.splitDetails.forEach(detail => {
        // Only consider unpaid shares
        if (!detail.hasPaid) {
          totalAmountLeftToBePaid += detail.share;

          // Track individual balances
          if (detail.name in individualBalances) {
            individualBalances[detail.name] += detail.share;
          } else {
            individualBalances[detail.name] = detail.share;
          }
        }
      });
    });

    // Structure the response with additional information
    res.json({
      expenses,
      totalAmountSpent : totalAmountSpent - totalAmountLeftToBePaid,
      totalAmountLeftToBePaid,
      individualBalances
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});



// Edit an expense (protected)
router.put("/edit/:id", authMiddleware, async (req, res) => {
  try {
    const updatedExpense = await Expense.findByIdAndUpdate(
      { _id: req.params.id, userId: req.user.userId },  // Ensure userId matches
      req.body,
      { new: true }
    );
    res.json(updatedExpense);
  } catch (error) {
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// Delete an expense (protected)
router.delete("/delete/:id", authMiddleware, async (req, res) => {
  try {
    await Expense.findByIdAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ message: "Expense deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// Analyze expense (protected)
router.get("/analyze", authMiddleware, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user.userId });
    const totalAmount = expenses.reduce((total, exp) => total + exp.amount, 0);

    // Category-wise spending
    const categoryWise = expenses.reduce((acc, exp) => {
      acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
      return acc;
    }, {});

    // Date-wise spending
    const dateWise = expenses.reduce((acc, exp) => {
      const date = new Date(exp.date).toISOString().split("T")[0]; // format as YYYY-MM-DD
      acc[date] = (acc[date] || 0) + exp.amount;
      return acc;
    }, {});

    // Monthly spending
    const monthlyWise = expenses.reduce((acc, exp) => {
      const month = new Date(exp.date).toISOString().slice(0, 7); // format as YYYY-MM
      acc[month] = (acc[month] || 0) + exp.amount;
      return acc;
    }, {});

    // Highest and Lowest Spending Categories
    const highestCategory = Object.keys(categoryWise).reduce((a, b) => (categoryWise[a] > categoryWise[b] ? a : b));
    const lowestCategory = Object.keys(categoryWise).reduce((a, b) => (categoryWise[a] < categoryWise[b] ? a : b));

    // Highest and Lowest Spending Dates
    const highestDate = Object.keys(dateWise).reduce((a, b) => (dateWise[a] > dateWise[b] ? a : b));
    const lowestDate = Object.keys(dateWise).reduce((a, b) => (dateWise[a] < dateWise[b] ? a : b));

    res.json({
      totalAmount,
      categoryWise,
      dateWise,
      monthlyWise,
      highestCategory: { category: highestCategory, amount: categoryWise[highestCategory] },
      lowestCategory: { category: lowestCategory, amount: categoryWise[lowestCategory] },
      highestDate: { date: highestDate, amount: dateWise[highestDate] },
      lowestDate: { date: lowestDate, amount: dateWise[lowestDate] },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to analyze expenses" });
  }
});


const XLSX = require('xlsx');

router.get("/report", authMiddleware, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user.userId });

    // Prepare expense data for the main sheet
    const expenseData = expenses.map(expense => ({
      Amount: expense.amount,
      Category: expense.category,
      Description: expense.description,
      SplitWith: expense.splitDetails.map(split => `${split.name} (${split.hasPaid ? 'Paid' : 'Unpaid'})`).join(", ")
    }));

    // Prepare category-wise summary data for charting
    const categorySummary = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {});

    const categorySummaryData = Object.entries(categorySummary).map(([category, amount]) => ({
      Category: category,
      TotalSpent: amount
    }));

    // Create a new workbook and add sheets
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Detailed Expenses
    const expenseSheet = XLSX.utils.json_to_sheet(expenseData);
    XLSX.utils.book_append_sheet(workbook, expenseSheet, "Expense Details");

    // Sheet 2: Category-wise Summary
    const categorySummarySheet = XLSX.utils.json_to_sheet(categorySummaryData);
    XLSX.utils.book_append_sheet(workbook, categorySummarySheet, "Category Summary");

    // Write the workbook to a buffer
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // Set response headers and send the file
    res.setHeader('Content-Disposition', 'attachment; filename="expense_report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to generate report" });
  }
});



module.exports = router;
