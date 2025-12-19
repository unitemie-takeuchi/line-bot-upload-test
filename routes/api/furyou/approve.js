// routes/api/furyou/approve.js
const express = require("express");
const router = express.Router();
const sql = require("mssql");

// POST /api/furyou/approve
router.post("/", async (req, res) => {
    const { id } = req.body;

    // ① パラメータチェック
    if (!id) {
        return res.status(400).json({
            success: false,
            message: "id が指定されていません"
        });
    }

    try {
        // ② DB接続
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

        // ③ UPDATE 実行
        await pool.request()
            .input("id", sql.Int, id)
            .query(`
                UPDATE dbo.T_MV不良報告書
                SET
                    status = '10',
                    approval_dt = GETDATE(),
                    reject_reason = NULL,
                    processed_dt = GETDATE()
                WHERE id = @id
            `);

        // ④ 正常終了
        return res.json({ success: true });

    } catch (err) {
        console.error("[APPROVE ERROR]", err);
        return res.status(500).json({
            success: false,
            message: "承認処理に失敗しました"
        });
    }
});

module.exports = router;
