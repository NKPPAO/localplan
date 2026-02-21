const express = require("express");
const mysql = require("mysql2/promise"); // ใช้ promise เพื่อให้เขียน await ได้ง่ายๆ
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static("views")); // สำหรับเสิร์ฟไฟล์ index.html

// ✅ MySQL Connection Pool (ดีกว่า Connection เฉยๆ เพราะรองรับคนเข้าพร้อมกันได้ดีกว่า)
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ✅ Route สำหรับดึงข้อมูลหน้าเว็บ (Settings)
app.get("/api/settings", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM settings");
    const settings = {};
    rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✅ Route สำหรับค้นหาโครงการ (แทน getData และ getData_ServerSide ใน GAS)
app.get("/api/projects", async (req, res) => {
  try {
    const { searchTerm, page = 1, pageSize = 50, amp, stat } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    let conditions = [];
    let params = [];

    if (searchTerm) {
      conditions.push("(project_name LIKE ? OR local_org LIKE ? OR id LIKE ?)");
      const s = `%${searchTerm}%`;
      params.push(s, s, s);
    }
    if (amp) { conditions.push("district = ?"); params.push(amp); }
    if (stat) { conditions.push("status = ?"); params.push(stat); }

    let whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    // 1. ดึงข้อมูลโครงการ
    const [items] = await db.execute(
      `SELECT * FROM projects ${whereClause} LIMIT ${parseInt(pageSize)} OFFSET ${offset}`, 
      params
    );

    // 2. นับจำนวนทั้งหมดสำหรับ Pagination
    const [countResult] = await db.execute(`SELECT COUNT(*) as total FROM projects ${whereClause}`, params);
    
    // 3. ดึงสถิติ (Stats) เหมือนใน GAS
    const [statsResult] = await db.execute("SELECT status, COUNT(*) as count FROM projects GROUP BY status");
    const stats = {};
    statsResult.forEach(row => { stats[row.status] = row.count; });

    res.json({
      items,
      totalCount: countResult[0].total,
      totalPages: Math.ceil(countResult[0].total / pageSize),
      stats: stats
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✅ Route สำหรับดึงข้อมูลเล่มแผน (PDF)
app.get("/api/plans", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM plans");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✅ Route สำหรับ Login (เทียบเท่า checkLogin ใน GAS)
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.execute("SELECT * FROM authen WHERE username = ?", [username]);
    if (rows.length === 0) return res.json({ status: false, message: "User not found" });

    const user = rows[0];
    // สร้าง Hash เพื่อตรวจสอบ (เลียนแบบ Logic hashSHA256 ใน GAS)
    const inputHash = crypto.createHash('sha256').update(password + user.salt).digest('hex');

    if (inputHash === user.hash) {
      res.json({ status: true, token: crypto.randomBytes(16).toString('hex') });
    } else {
      res.json({ status: false, message: "Wrong password" });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✅ Route สำหรับอัปเดตข้อมูล (Update Project)
app.put("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  const { remark, status } = req.body;
  try {
    await db.execute(
      "UPDATE projects SET remark = ?, status = ? WHERE id = ?", 
      [remark, status, id]
    );
    res.json({ status: "success", message: "อัปเดตข้อมูลสำเร็จ" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✅ Route หลัก
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
