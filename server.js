const express = require("express");
const mysql = require("mysql2");

const app = express();
app.use(express.json());

// ✅ MySQL Connection
const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

db.connect(err => {
  if (err) {
    console.error("❌ DB connection failed:", err);
  } else {
    console.log("✅ MySQL connected");
  }
});

// ✅ test route
app.get("/", (req, res) => {
  res.send("API RUNNING");
});

// ✅ ใช้ PORT ของ Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
