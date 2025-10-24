const express = require("express");
const router = express.Router();
const { sql } = require("../../utils/sqlClient");
const dbConfig = require("../../config/dbConfig");

router.get("/", async (req, res) => {
  const lineId = String(req.query.lineId || "").trim();
  if (!lineId) return res.status(400).json({ error: "lineId is required" });

  let pool;
  try {
    pool = await sql.connect(dbConfig);

    const rs = await pool.request()
      .input("lineId", sql.NVarChar(64), lineId)
      .query(`
        SELECT TOP 1
          s.user_id,
          s.氏名,
          r.department_full_name,
          d.department_name
        FROM dbo.T_LINE_ID l
        INNER JOIN dbo.T_社員 s
               ON l.user_id = s.user_id
        LEFT JOIN dbo.T_社員_部署役職 r
               ON s.user_id = r.user_id
        LEFT JOIN dbo.T_部署 d
               ON r.department_full_name = d.department_full_name
        WHERE l.line_id = @lineId
          AND s.在職ステータス = N'employed'
        ORDER BY
          ISNULL(r.rank, 0) DESC,
          ISNULL(r.作成日時, s.更新日時) DESC
      `);

    if (!rs.recordset.length) {
      console.log("💥 whoami: lineId は見つからなかった");
      return res.json({ found: false });
    }

    const row = rs.recordset[0];
    const hasDepartment = !!row.department_full_name;

    return res.json({
      found: true,
      user_id: row.user_id,
      氏名: row.氏名,
      department_full_name: row.department_full_name || null,
      department_name: row.department_name || null,
      hasDepartment
    });
  } catch (err) {
    console.error("whoamiエラー:", err);
    return res.status(500).json({ error: "internal server error" });
  } finally {
    try { if (pool) await pool.close(); } catch {}
  }
});

module.exports = router;
