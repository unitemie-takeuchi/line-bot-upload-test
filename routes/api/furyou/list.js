// C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\list.js

const express = require("express");
const sql = require("mssql");
require('dotenv').config();
const db = require("../../../utils/sqlClient");
const router = express.Router();

router.get("/", async (req, res) => {
  const owner_cd = req.query.owner_cd;

  if (!owner_cd) {
    return res.status(400).json({ error: "owner_cd is required" });
  }

  // 接続設定の上書き (前回までの最終修正)
  const serverValue = process.env.SQL_SERVER || db.server;
  const serverIPOnly = serverValue.split('\\')[0];
  const dbConfigIPOnly = {
    ...db,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: serverIPOnly,
    port: parseInt(process.env.SQL_PORT),
    database: process.env.SQL_DATABASE,
    options: {
      ...db.options,
      encrypt: true,
      trustServerCertificate: true
    }
  };

  // 🚨 🚨 🚨 ここが try-catch のスタート 🚨 🚨 🚨
  try {
    const pool = await sql.connect(dbConfigIPOnly);

    const result = await pool.request()
      .input("owner_cd", sql.VarChar, owner_cd)
      .query(`
      SELECT 
        [id],
        [pdf_file_name],
        [status]
      FROM [dbo].[T_MV不良報告書] 
      WHERE owner_cd = @owner_cd
      ORDER BY pdf_file_name
    `); // 👈 テーブル名は[dbo].[T_MV不良報告書]の形で戻す

    // ☆ ファイル名から3つの情報を抽出
    const list = result.recordset.map(row => {
      const parts = row.pdf_file_name.split("_");

      const ownerCd = parts[0];
      const seqTitle = parts[1];
      const ownerName = parts[2].replace(".pdf", "");

      const seq = seqTitle.split("-")[0];

      return {
        id: row.id,
        seq: seq,
        title: seqTitle,
        ownerName: ownerName,
        fileName: row.pdf_file_name,
        status: row.status
      };
    });

    res.json(list);

  } catch (err) {
    console.error("LIST API ERROR:", err);
    // ここでサーバーエラーではなく、接続成功したことを示すために詳細なエラーを返すのも有効
    res.status(500).json({ error: "server error", detail: err.message });
  }
  });

  module.exports = router;