//C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\trigger.js

const express = require("express");
const router = express.Router();
const fs = require("fs");

const state = require("../../../state-manager");
const processFuryouReports = require("../../../process-furyou");

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
  fs.appendFileSync(LOG_FILE, "Process start requested.\n");

  processFuryouReports()
    .catch(err => {
      console.error(err);
    })
    .finally(() => {
      state.setProcessing(false);
    });

  res.send("Trigger OK");
});

module.exports = router;