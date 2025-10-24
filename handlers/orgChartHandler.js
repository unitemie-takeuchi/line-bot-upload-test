const express = require('express');
const router = express.Router();
const sql = require('mssql');

const config = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    trustServerCertificate: true,
  },
};

router.get('/departments', async (req, res) => {
  try {
    await sql.connect(config);
    const result = await sql.query(`
      SELECT department_id, department_name, department_full_name, parent_department_id
      FROM dbo.T_部署
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ 部署取得エラー:', err);
    res.status(500).send('エラー');
  }
});

router.get('/employees', async (req, res) => {
  try {
    await sql.connect(config);
    const result = await sql.query(`
      SELECT R.user_id, R.department_full_name, R.position_name, R.rank, S.氏名, S.在職ステータス
      FROM dbo.T_社員_部署役職 R
      LEFT JOIN dbo.T_社員 S ON R.user_id = S.user_id
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ 社員取得エラー:', err);
    res.status(500).send('エラー');
  }
});

module.exports = router;
