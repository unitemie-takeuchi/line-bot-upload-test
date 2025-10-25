// routes/api/link-lineid.js (修正版)
console.log('🧩 link-lineid HANDLER BUILD v2025-10-25-FIX', __filename);

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const dbConfig = require('../../config/dbConfig');

router.post('/link-lineid', async (req, res) => {
    res.setHeader('X-Handler', 'link-lineid-router-v4');

    // 入力
    const raw = req.body ?? {};
    const bool = v => v === true || v === 'true' || v === 1 || v === '1';
    const lineId = String(raw.lineId || '').trim();
    const userId = String(raw.userId || '').trim();
    const force = bool(raw.force);

    console.log('🔥 /api/link-lineid 受信:', {
        lineId, userId, rawForce: raw.force, normForce: force
    });
    if (!lineId || !userId) return res.status(400).json({ error: 'badRequest' });

    const cfg = process.env.SQL_CONNECTION_STRING ?? dbConfig;

    let pool;
    let tx;
    try {
        pool = await sql.connect(cfg);
        tx = new sql.Transaction(pool);
        await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
        console.log("🟢 トランザクション開始");

        // 1) 在職ユーザーの存在確認（本人が有効か）
        const rsUser = await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .query(`
                SELECT TOP 1 user_id, 氏名
                FROM dbo.T_社員
                WHERE user_id = @userId AND 在職ステータス = N'employed'
            `);
        if (rsUser.recordset.length === 0) {
            await tx.rollback();
            return res.status(404).json({ error: 'userNotFoundOrNotEmployed' });
        }
        const target = rsUser.recordset[0];

        // 2) 競合確認
        //  a) この lineId が既に別ユーザーに割り当て済みか？
        const rsLineInUse = await pool.request()
            .input('lineId', sql.NVarChar(64), lineId)
            .input('userId', sql.UniqueIdentifier, userId)
            .query(`
                SELECT TOP 1 line_id, user_id
                FROM dbo.T_LINE_ID
                WHERE line_id = @lineId AND user_id <> @userId
            `);

        //  b) この userId に既に別の lineId が割り当て済みか？ (競合チェックは維持)
        const rsUserHasOther = await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('lineId', sql.NVarChar(64), lineId)
            .query(`
                SELECT TOP 1 line_id, user_id
                FROM dbo.T_LINE_ID
                WHERE user_id = @userId AND line_id <> @lineId
            `);

        console.log('🔍 競合チェック', {
            lineUsedByOther: rsLineInUse.recordset.length > 0,
            userHasOtherLine: rsUserHasOther.recordset.length > 0,
            force
        });

        // 3) force なしなら 409 で確認を促す
        if (!force) {
            if (rsLineInUse.recordset.length) {
                return res.status(409).json({
                    error: 'lineInUseByOther',
                    holder: rsLineInUse.recordset[0]
                });
            }
            if (rsUserHasOther.recordset.length) {
                return res.status(409).json({
                    error: 'userHasOtherLine',
                    current: rsUserHasOther.recordset[0]
                });
            }
        }

        // 4) トランザクション開始（競合解消と付け替えを原子的に実行）
        const reqTx = new sql.Request(tx);

        // 4-a) 同じ lineId が他人に付与済みなら剥がす (LINE IDの単一使用を保証)
        if (rsLineInUse.recordset.length) {
            await reqTx
                .input('lineId', sql.NVarChar(64), lineId)
                .query(`DELETE FROM dbo.T_LINE_ID WHERE line_id = @lineId`);
        }

        // 4-b) 本人に別の lineId が付与済みなら剥がす (MERGEが更新するが、明示的な削除も原子性を高めるため維持)
        if (rsUserHasOther.recordset.length) {
            await reqTx
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`DELETE FROM dbo.T_LINE_ID WHERE user_id = @userId`);
        }

        // 4-c) 最終的にこの lineId を本人に紐づけ（UPSERT）
        await reqTx
            .input('lineId', sql.NVarChar(64), lineId)
            .input('userId', sql.UniqueIdentifier, userId)
            .query(`
                MERGE dbo.T_LINE_ID AS t
                USING (SELECT @lineId AS line_id, @userId AS user_id) AS s
                ON (t.user_id = s.user_id)
                WHEN MATCHED THEN
                    UPDATE SET line_id = s.line_id, 更新日時 = SYSDATETIME()
                WHEN NOT MATCHED THEN
                    INSERT (line_id, user_id, 登録日時, 更新日時)
                    VALUES (s.line_id, s.user_id, SYSDATETIME(), SYSDATETIME());
            `);

        await tx.commit();

        console.log('📝 紐づけ完了:', { lineId, userId });
        return res.status(200).json({ ok: true, updated: true });
    } catch (e) {
        try { if (tx && tx._aborted !== true) await tx.rollback(); } catch { }
        console.error('DBエラー:', e);
        return res.status(500).json({ error: 'serverError' });
    } finally {
        try { if (pool) await pool.close(); } catch { }
    }
});

module.exports = router;