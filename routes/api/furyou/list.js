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
        [status],
        [shop_name],    -- 店舗名
        [delivery_date], -- 納品日
        [product_name],   -- 商品名
        [return_reason]
      FROM [dbo].[T_MV不良報告書] 
      WHERE owner_cd = @owner_cd
        AND (report_flg = 0 OR report_flg IS NULL) 
      ORDER BY id ASC 
    `);
    const list = result.recordset.map(row => {
      // 日付を yyyy/mm/dd に整形
      const d = row.delivery_date ? new Date(row.delivery_date) : null;
      const formattedDate = d ? `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}` : "";

      return {
        id: row.id,
        shopName: row.shop_name,        // HTML側の rep.shopName と一致させる
        deliveryDate: formattedDate,     // HTML側の rep.deliveryDate と一致させる
        productName: row.product_name,   // HTML側の rep.productName と一致させる
        returnReason: row.return_reason || "",
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