const jwt = require("jsonwebtoken");

const JWT_SECRET = "QOWEIFH0293YFIODLSBCSJD323FC";

function authMiddleware(req, res, next) {
  // Check for token in x-auth-token header
  const token = req.header("x-auth-token");

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    // Verify the token and extract the user
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();  // Move to the next middleware or route handler
  } catch (error) {
    res.status(400).json({ message: "Invalid token" });
  }
}

module.exports = authMiddleware;
