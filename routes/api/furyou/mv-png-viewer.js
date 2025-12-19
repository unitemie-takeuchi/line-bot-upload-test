// C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\mv-png-viewer.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const OUTPUT_DIR = "C:/Line-Bot-Upload/line-bot-upload-test/temp/furyou";

// GET /api/furyou/png?file=xxxx.png
router.get("/", (req, res) => {
  const fileName = req.query.file;
  if (!fileName) {
    return res.status(400).send("file が指定されていません");
  }

  const filePath = path.join(OUTPUT_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    console.error("[PNG NOT FOUND]", filePath);
    return res.status(404).send("PNG が見つかりません");
  }

  // ★ LIFF対策ヘッダ（最重要）
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", "inline");
  res.removeHeader("X-Frame-Options");

  res.sendFile(filePath, err => {
    if (err) {
      console.error("[PNG SEND ERROR]", err.message);
      res.status(500).send("PNG の送信中にエラーが発生しました");
    }
  });
});

module.exports = router;
