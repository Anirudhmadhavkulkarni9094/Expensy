const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const expenseRoutes = require("./routes/expenseRoutes");
const authRoutes = require("./routes/authRoutes");
const app = express();
require('dotenv').config();
// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connection
mongoose.connect(process.env.MONGODB_URL)
  .then(() => {
    console.log("Database connection established");
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
  });
// Routes
app.use("/api/expenses", expenseRoutes);
app.use("/api/auth", authRoutes);

app.listen(3001, () => {
  console.log("Server running at 3001");
});
