// C:\Line-Bot-Upload\line-bot-upload-test\routes\api\notify-approver.js
require('dotenv').config();
const dbconfig = require('../../config/dbConfig');
const express = require("express");
const router = express.Router();
const { sql, poolConnect } = require("../../utils/sqlClient");
const { Client } = require('@line/bot-sdk');

const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

// POST /api/notify-approver
router.post('/', async (req, res) => {
  await poolConnect; // ← 他のAPIと同じように接続待ち
  try {
    const {
      request_id,
      approver_user_id,
      applicant_name,
      leave_type,
      start_date,
      end_date
    } = req.body;

    const pool = await sql.connect(dbconfig);

    // 申請者のランクを確認
    const rankRes = await pool.request()
      .input('user_id', sql.NVarChar, approver_user_id)
      .query(`
        SELECT MIN(rank) AS my_rank
        FROM dbo.T_社員_部署役職
        WHERE user_id = @user_id
      `);
    const myRank = rankRes.recordset[0]?.my_rank;

    // 役員以上（rank 1 or 2）は自己承認扱いで終了
    if (myRank && myRank <= 2) {
      return res.json({
        success: true,
        message: '承認不要（自己承認扱い）として申請を完了しました'
      });
    }

    // 通常フロー：承認者の LINE ID を取得
    const result = await pool.request()
      .input('user_id', sql.NVarChar, approver_user_id)
      .query(`
        SELECT 
          l.line_id,
          s.氏名
        FROM 
          T_社員 s
        INNER JOIN 
          T_LINE_ID l ON s.user_id = l.user_id
        WHERE 
          s.user_id = @user_id
      `);

    if (!result.recordset.length || !result.recordset[0].line_id) {
      return res.status(404).json({ message: '承認者のLINE IDが見つかりません' });
    }

    const { line_id, 氏名: approver_name } = result.recordset[0];

    // LIFF承認URL
    const approvalUrl = `https://unitemie.com/liff/approvals?id=${encodeURIComponent(request_id)}`;

    // LINEメッセージ本文
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('ja-JP'); // 例: 2025/09/18
    };

    const message = {
      type: 'text',
      text: `📩 ${applicant_name} さんから【${leave_type}】申請が届いています。\n期間：${formatDate(start_date)} ～ ${formatDate(end_date)}\n\n👇申請内容を確認する\n${approvalUrl}`
    };

    try {
      await lineClient.pushMessage(line_id, message);
      console.log("✅ LINE通知送信成功:", line_id);
    } catch (err) {
      console.error("❌ LINE通知失敗:", err.originalError || err);
    }

    res.json({ success: true, message: '通知を送信しました' });
  } catch (err) {
    console.error('❌ notify-approverエラー:', err);
    res.status(500).json({ success: false, message: '通知に失敗しました', error: err.message });
  }
});

module.exports = router;