const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../../utils/sqlClient");
const dbConfig = require("../../config/dbConfig");

router.get('/', async (req, res) => {
  try {
    const start = req.query.start;
    const end = req.query.end;
    const pool = await poolPromise;

    if (!start || !end) {
      return res.status(400).json({ error: "start and end are required" });
    }

    const result = await pool.request()
      .input("start", sql.VarChar(8), start)
      .input("end", sql.VarChar(8), end)
      .query(`
        SELECT COUNT(chrKdoKBN) AS days
        FROM dbo.T_会社カレンダー
        WHERE chrYMD BETWEEN @start AND @end
          AND chrKdoKBN = 1
      `);

    const days = result.recordset[0].days || 0;
    console.log(result.recordset[0]);
    res.json({ days });
  } catch (err) {
    console.error("❌ /api/workdays エラー:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
