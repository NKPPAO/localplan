const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors()); // อนุญาตให้ Frontend เรียกใช้ API

// ✅ MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10
});

// 1. ดึงการตั้งค่า (Settings)
app.get("/api/settings", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM settings");
    const settings = {};
    rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. ค้นหาโครงการแบบ Pagination + Filter (แทน getData_ServerSide)
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

    const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    // ดึงข้อมูล
    const [items] = await pool.execute(
      `SELECT * FROM projects ${whereClause} LIMIT ${parseInt(pageSize)} OFFSET ${offset}`, 
      params
    );

    // นับจำนวนทั้งหมด
    const [countResult] = await pool.execute(`SELECT COUNT(*) as total FROM projects ${whereClause}`, params);
    
    // ดึงสถิติแยกตามสถานะ (stats)
    const [statsResult] = await pool.execute("SELECT status, COUNT(*) as count FROM projects GROUP BY status");
    const stats = {};
    statsResult.forEach(row => { stats[row.status] = row.count; });

    res.json({
      items,
      totalCount: countResult[0].total,
      totalPages: Math.ceil(countResult[0].total / pageSize),
      stats
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. ระบบ Login (เทียบเท่า checkLogin ใน GAS)
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.execute("SELECT * FROM authen WHERE username = ?", [username]);
    if (rows.length === 0) return res.json({ status: false });

    const user = rows[0];
    const inputHash = crypto.createHash('sha256').update(password + user.salt).digest('hex');

    if (inputHash === user.hash) {
      res.json({ status: true, token: crypto.randomUUID() });
    } else {
      res.json({ status: false });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. อัปเดตข้อมูลโครงการ (Update Project)
app.put("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  const { remark, status } = req.body;
  try {
    await pool.execute(
      "UPDATE projects SET remark = ?, status = ? WHERE id = ?", 
      [remark, status, id]
    );
    res.json({ message: "อัปเดตข้อมูลสำเร็จ" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
