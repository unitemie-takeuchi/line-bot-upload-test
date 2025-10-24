//C:\Line-Bot-Upload\line-bot-upload-test\routes\api\request.js
require('dotenv').config(); 
const dbconfig = require('../../config/dbConfig');
const express = require("express");
const router = express.Router();
const { sql, poolConnect } = require("../../utils/sqlClient");

console.log('[DEBUG] SQL_PORT:', process.env.SQL_PORT);

// POST /api/submit-request
router.post('/submit-request', async (req, res) => {
    await poolConnect;
    try {
        const {
            request_id,
            user_id,
            department_full_name,
            leave_type,
            start_date,
            end_date,
            start_time,
            end_time,
            reason,
            contact_method,
            approver_user_id
        } = req.body;

        const pool = await sql.connect(dbconfig);

        // トランザクション開始
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. T_申請 にINSERT
            await transaction.request()
                .input('request_id', sql.NVarChar, request_id)
                .input('user_id', sql.NVarChar, user_id)
                .input('department_full_name', sql.NVarChar, department_full_name)
                .input('leave_type', sql.NVarChar, leave_type)
                .input('start_date', sql.Date, start_date)
                .input('end_date', sql.Date, end_date || null)
                .input('start_time', sql.VarChar, start_time || null)
                .input('end_time', sql.VarChar, end_time || null)
                .input('reason', sql.NVarChar, reason || null)
                .input('contact_method', sql.NVarChar, contact_method || null)
                .query(`
          INSERT INTO T_申請 (
            request_id, user_id, department_full_name, leave_type,
            start_date, end_date, start_time, end_time,
            reason, contact_method, created_at
          ) VALUES (
            @request_id, @user_id, @department_full_name, @leave_type,
            @start_date, @end_date, @start_time, @end_time,
            @reason, @contact_method, GETDATE()
          )
        `);

            // 2. T_申請_決裁状況 に1件目の承認者をINSERT（未承認）
            await transaction.request()
                .input('request_id', sql.NVarChar, request_id)
                .input('approver_user_id', sql.NVarChar, approver_user_id)
                .query(`
          INSERT INTO T_申請_決裁状況 (
            request_id, approver_user_id, approval_order, status
          ) VALUES (
            @request_id, @approver_user_id, 1, '未承認'
          )
        `);

            // コミット
            await transaction.commit();

            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            console.error('❌ 申請トランザクション失敗:', err);
            res.status(500).json({ success: false, message: '申請登録に失敗しました。' });
        }

    } catch (err) {
        console.error('❌ APIレベルエラー:', err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' });
    }
});

module.exports = router;
