// routes/api/unlink-lineid.js
console.log('🧩 unlink-lineid HANDLER BUILD v2025-09-04-1', __filename);

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../../config/dbConfig');

router.post('/', async (req, res) => {
  res.setHeader('X-Handler', 'unlink-lineid-router-v1');

  const raw = req.body ?? {};
  const lineId = String(raw.lineId || '').trim();
  const userId = String(raw.userId || '').trim();
  const force = raw.force === true || raw.force === 'true';

  console.log('🧹 /api/unlink-lineid 受信:', { lineId, userId, force });

  if (!lineId || !userId) {
    return res.status(400).json({ error: 'badRequest' });
  }

  const cfg = process.env.SQL_CONNECTION_STRING ?? dbConfig;
  let pool;
  try {
    pool = await sql.connect(cfg);

    const result = await pool.request()
      .input('lineId', sql.NVarChar(64), lineId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        DELETE FROM dbo.T_LINE_ID
        WHERE line_id = @lineId AND user_id = @userId
      `);

    console.log('✅ 解除完了:', {
      affectedRows: result.rowsAffected[0],
      lineId, userId
    });

    return res.json({ ok: true, deleted: result.rowsAffected[0] });

  } catch (e) {
    console.error('解除エラー:', e);
    return res.status(500).json({ error: 'serverError' });
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
});

module.exports = router;