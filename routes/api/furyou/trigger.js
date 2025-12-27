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
      // 🌟 【本番移行後の確認用】この3人にだけ通知を送る
      const testTargetIds = [
        "U29c7b04b8084561da3d7100355e4395c",
        "Ud777cf0b667686e2885275dcdd549e72",
        "U94eae9f3e274fe2e0b399158edde6892"
      ];

      // broadcastのかわりに、一人ずつに送る(pushMessage)
      for (const userId of testTargetIds) {
        try {
          await client.pushMessage(userId, {
            type: 'text',
            text: `📢 不良報告書の準備完了のお知らせ

マックスバリュの不良報告書の準備ができました！
LINE画面より決裁処理をお願いします。`
          });
          fs.appendFileSync(LOG_FILE, `[SUCCESS] Sent to ${userId}\n`);
        } catch (err) {
          fs.appendFileSync(LOG_FILE, `[FAILED] Sent to ${userId}: ${err.message}\n`);
        }
      }

      fs.appendFileSync(LOG_FILE, "LINE Test-Notification completed.\n");
    })
    .catch(err => {
      state.setProcessing(false);
    });

  res.send("Trigger OK");
});

module.exports = router;