//C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\index.js

const express = require('express');
const router = express.Router();

// 既存処理
router.use('/trigger', require('./trigger'));

// 新規API
router.use('/list', require('./list'));
router.use('/approve', require('./approve'));
router.use('/reject', require('./reject'));

module.exports = router;
