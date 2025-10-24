const express = require("express");
const router = express.Router();

const { sql } = require("../../utils/sqlClient");
const dbConfig = require("../../config/dbConfig");

router.get("/", async (req, res) => {
  console.log("✅ /api/users-by-department リクエスト受信");
  const deptFullName = req.query.department || req.query.department_full_name;
  console.log("📥 受け取った部署名:", deptFullName);

  // 🔍 デバッグ追加：クエリパラメータと一致する部署名かチェック
  console.log("🔍 SQLに渡す @department_full_name =", deptFullName);

  if (!deptFullName) {
    return res.status(400).json({ error: "部署名が指定されていません" });
  }

  let pool;
  try {
    pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input("department_full_name", sql.NVarChar, deptFullName)
      .query(`
SELECT DISTINCT
  s.user_id,
  s.emp_code,
  s.氏名,
  r.position_name,
  r.rank,
  d.department_name,
  d.department_full_name
FROM dbo.T_社員 s
CROSS APPLY (
  SELECT TOP 1 *
  FROM dbo.T_社員_部署役職 r
  WHERE r.user_id = s.user_id
    AND r.department_full_name = @department_full_name
    AND r.rank IS NOT NULL
  ORDER BY r.rank ASC
) r
INNER JOIN dbo.T_部署 d ON r.department_full_name = d.department_full_name
WHERE s.在職ステータス = 'employed'
ORDER BY rank, emp_code;
            `);
    console.log("🎯 該当社員数:", result.recordset.length);
    res.json(result.recordset);

  } catch (err) {
    console.error("❌ 社員取得エラー:", err);
    res.status(500).json({ error: "社員一覧取得に失敗しました" });
  }
});

module.exports = router;