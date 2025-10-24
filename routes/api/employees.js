const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../../utils/sqlClient'); // 統一された場所にある前提

router.get('/employees', async (req, res) => {
  const departmentFullName = req.query.department_full_name;

  if (!departmentFullName) {
    return res.status(400).json({ error: '部署名（department_full_name）が必要です' });
  }

  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input('dept', sql.NVarChar, departmentFullName)
      .query(`
        SELECT DISTINCT
          d.department_name,
          d.department_full_name,
          s.emp_code,
          s.氏名,
          r.position_name,
          r.rank
        FROM dbo.T_部署 d
        INNER JOIN dbo.T_社員_部署役職 r ON d.department_full_name = r.department_full_name
        INNER JOIN dbo.T_社員 s ON r.user_id = s.user_id
        WHERE d.department_full_name = @dept
        ORDER BY r.rank, s.emp_code
      `);

    res.json(result.recordset);

  } catch (err) {
    console.error('[ERROR] /api/employees:', err);
    res.status(500).json({ error: 'DBエラーが発生しました' });
  }
});

module.exports = router;
