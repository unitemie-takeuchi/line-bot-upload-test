const express = require("express");
const router = express.Router();
const { sql } = require("../../utils/sqlClient");
const dbConfig = require("../../config/dbConfig");

router.get("/", async (req, res) => {
    console.log("✅ /api/candidate-users リクエスト受信");

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
      SELECT DISTINCT
        d.department_name,
        d.department_full_name,
        s.emp_code,
        s.氏名,
        r.position_name,
        r.rank,
        s.user_id
      FROM dbo.T_部署 d
      INNER JOIN dbo.T_社員_部署役職 r
        ON d.department_full_name = r.department_full_name
      INNER JOIN dbo.T_社員 s
        ON r.user_id = s.user_id
      ORDER BY
        d.department_full_name,
        r.rank,
        s.emp_code
    `);

        console.log("🎯 対象社員件数:", result.recordset.length);
        res.json(result.recordset);
    } catch (err) {
        console.error("❌ 社員一覧取得エラー:", err.message);
        console.error("📦 エラー詳細:", err);
        res.status(500).json({ error: "社員一覧取得に失敗しました" });
    }

});

module.exports = router;
