//C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\trigger.js

const express = require("express");
const router = express.Router();
const fs = require("fs");
const { Client } = require('@line/bot-sdk');

const state = require("../../../state-manager");
const processFuryouReports = require("../../../process-furyou");

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

const LOG_FILE = "C:/Line-Bot-Upload/line-bot-upload-test/logs/furyou-trigger.log";

router.post("/", async (req, res) => {
  const key = req.query.k;

  if (key !== process.env.FURYOU_SECRET_KEY) {
    return res.status(403).send("Forbidden");
  }

  fs.appendFileSync(
    LOG_FILE,
    `[${new Date().toLocaleString()}] Trigger received\n`
  );

  // すでに処理中
  if (state.isProcessing()) {
    fs.appendFileSync(LOG_FILE, "Already processing. Ignored.\n");
    return res.send("Already processing");
  }

  // 再実行待ち中
  if (state.isWaitingRetry()) {
    fs.appendFileSync(LOG_FILE, "Waiting retry confirmation. Ignored.\n");
    return res.send("Waiting retry confirmation");
  }

  // 処理開始
  state.setProcessing(true);

  processFuryouReports()
    .then(async () => {
      // ✅ ここで「緊急メッセージ」と同じ仕組みを使って通知！
      await client.broadcast({
        type: 'text',
        text: `📢 不良報告書の準備完了のお知らせ

マックスバリュの不良報告書の準備ができました！
LINE画面より決裁処理をお願いします。`
      });
      fs.appendFileSync(LOG_FILE, "LINE Broadcast sent successfully.\n");
    })
    .catch(err => {
      fs.appendFileSync(LOG_FILE, `❌ Error: ${err.message}\n`);
    })
    .finally(() => {
      state.setProcessing(false);
    });

  res.send("Trigger OK");
});

module.exports = router;