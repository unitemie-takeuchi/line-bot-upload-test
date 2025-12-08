const express = require("express");
const router = express.Router();
const fs = require('fs');

const LOG_FILE = "C:/Line-Bot-Upload/line-bot-upload-test/logs/furyou-trigger.log";

router.post('/', async (req, res) => {
  const key = req.query.k;

  if (key !== process.env.FURYOU_SECRET_KEY) {
    return res.status(403).send("Forbidden");
  }

  fs.appendFileSync(
    LOG_FILE,
    `[${new Date().toLocaleString()}] Trigger received from Access\n`
  );

  res.send("Trigger OK");
});

module.exports = router;
