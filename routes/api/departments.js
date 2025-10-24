// routes/api/departments.js
const express = require('express');
const router = express.Router();
const { sql } = require('../../utils/sqlClient');
const dbConfig = require('../../config/dbConfig');

router.get("/", async (req, res) => {
  console.log("✅ /api/departments リクエスト受信");

  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query(`
SELECT DISTINCT
  d.department_name,
  d.department_full_name
FROM dbo.T_部署 AS d
WHERE EXISTS (
  SELECT 1
  FROM dbo.T_社員_部署役職 AS r
  JOIN dbo.T_社員 AS s
    ON s.user_id = r.user_id
   AND s.在職ステータス = N'employed'
  WHERE r.department_full_name = d.department_full_name
)
ORDER BY d.department_full_name;
    `);

    console.log("🎯 部署一覧件数:", result.recordset.length);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ 部署一覧取得エラー:", err);
    res.status(500).json({ error: "部署取得に失敗しました" });
  }
});

module.exports = router;
