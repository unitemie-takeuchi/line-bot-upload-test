const express = require('express');
const router = express.Router();
const sql = require('mssql');

router.post('/', async (req, res) => {
    try {
        const { id, reason } = req.body;

        if (!id || !reason) {
            return res.status(400).json({
                success: false,
                message: 'id または 否認理由が不足しています',
            });
        }

        const pool = await sql.connect({
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            server: process.env.SQL_SERVER,
            database: process.env.SQL_DATABASE,
            options: {
                encrypt: true,
                trustServerCertificate: true,
            },
        });

        await pool.request()
            .input('id', sql.Int, id)
            .input('reason', sql.NVarChar, reason)
            .query(`
                UPDATE dbo.T_MV不良報告書
                SET
                    status = '20',
                    reject_reason = @reason,
                    processed_dt = GETDATE()
                WHERE id = @id
            `);

        return res.json({ success: true });

    } catch (err) {
        console.error('[REJECT ERROR]', err);
        return res.status(500).json({
            success: false,
            message: '否認処理に失敗しました',
        });
    }
});

module.exports = router;
