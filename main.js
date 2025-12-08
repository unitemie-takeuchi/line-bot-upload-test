// main.js
require('dotenv').config();
const fs = require('fs');
const { notifyAdmin } = require('./utils/lineNotify');
const mvReportHandler = require("./handlers/mvReportHandler");
const { getEmployeeList, getSelectedEmployeeCode } = require('./utils/employeeLoader');
const { createMVEmployeeCarousel } = require('./utils/carouselBuilder');

// ✅ .env 存在チェック（任意だけど有効）
if (!fs.existsSync('.env')) {
  const msg = '❌ .env ファイルが存在しません。環境変数が全て未定義です。';
  console.error(msg);
  notifyAdmin(msg).then(() => process.exit(1));
}

// ✅ 環境変数の必須チェック
const requiredEnvVars = [
  { key: 'PORT', validate: (v) => !isNaN(parseInt(v, 10)) },
  {
    key: 'BASE_SHORT_URL', validate: (v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }
  },
];

const invalidVars = requiredEnvVars.filter(({ key, validate }) => {
  const value = process.env[key];
  return !value || !validate(value);
});

if (invalidVars.length > 0) {
  const msg = `❌ 以下の環境変数が未設定または不正です：${invalidVars.map(v => v.key).join(', ')}`;
  console.error(msg);
  notifyAdmin(msg).then(() => process.exit(1));
}

require('./utils/dailyCleaner');
const logger = require('./utils/logger');
const express = require('express');
const line = require('@line/bot-sdk');
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const app = express();
app.use(express.static('public'));
const client = new line.Client(config);
const sessionManager = require('./utils/sessionManager');
const reportHandler = require('./handlers/reportHandler');
const replyMessage = require('./utils/replyMessage');
const { handleFileMessage } = require('./handlers/receiveFileHandler');
const { uploadPdfAndGetLink } = require('./handlers/uploadToOneDrive');
const { handleSelectedReportName } = require('./utils/reportLoader');
const { router: shortlinkRouter, storeShortLink } = require('./utils/shortlinkController');

app.use('/', shortlinkRouter);
app.use('/api/furyou', require('./routes/api/furyou'));

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    for (const event of events) {
      if (event.type === 'postback') {
        await handlePostback(event);
        continue;
      }

      if (event.type === 'message') {
        // テキストは handleMessage、ファイルは handleFile に振り分け
        if (event.message.type === 'text') {
          await handleMessage(event);
        } else if (event.message.type === 'file') {
          await handleFileMessage(event, client);
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[ERROR] Webhook failed:', err);
    if (err.stack) {
      console.error('[STACK TRACE]', err.stack);
    }
    res.status(500).end();
  }
});

async function handlePostback(event) {
  const data = event.postback.data;
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const session = sessionManager.getSession(userId) || sessionManager.initSession(userId);

  if (
    data.startsWith("mvEmpSelect:") ||
    data.startsWith("mvEmpNext:") ||
    data.startsWith("mvReport:")
  ) {
    return await mvReportHandler.handlePostback(event);
  }
}

async function handleMessage(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const userMessage = event.message?.text?.trim() || event.postback?.data?.trim() || '';
  const text = userMessage;

  let session = sessionManager.getSession(userId) || sessionManager.initSession(userId);

  logger.debug('[DEBUG] event.message.type:', event.message.type);
  logger.debug('[DEBUG] userId:', userId);
  logger.debug('[DEBUG] 現在のセッション:', session);
  logger.debug('[DEBUG] text内容:', text);
  logger.debug('[DEBUG] session.step内容:', session.step);
  logger.debug('[DEBUG] session.mode内容:', session.mode);

  if (session.mode === 'upload' && session.step === 'selectEmployee' && /^\d{3}$/.test(text)) {
    return reportHandler.handleUploadEmployeeSelection(userId, text, replyToken);
  }

  if (event.message?.type === 'file') {
    return handleFileMessage(event);
  }

  if (["オーダー", "実績"].includes(text)) {
    sessionManager.clear(userId);
    return await reportHandler.handleStartCommand(userId, replyToken, text);
  }

  if (text === "指示書") {
    sessionManager.clear(userId);
    const session = sessionManager.initSession(userId);
    session.reportMode = '指示書';
    sessionManager.setStep(userId, 'selectShijishoOption');

    return replyMessage.sendInstructionOptions(replyToken); // ← 送付／参照カルーセルを返す処理
  }

  if (text === "報告書") {
    sessionManager.clear(userId);
    return await mvReportHandler.handleStartCommand(userId, replyToken);
  }

  if (/^\d{3}$/.test(text) && session.step === 'selectEmployee') {
    return await reportHandler.handleEmployeeSelect(userId, text, replyToken);
  }

  if (text.startsWith('帳票') && session.step === 'selectReport') {
    if (session.mode === '指示書') {
      return await reportHandler.handleShijishoReportSelect(userId, text, replyToken);
    } else {
      return await handleSelectedReportName(userId, text, replyToken);
    }
  }

  // 🟢 次へ社員
  if (text.startsWith('次へ社員')) {
    const page = parseInt(text.split(' ')[1], 10);
    return reportHandler.handleNextEmployeePage(userId, page, replyToken);
  }

  // 🟢 指示書選択
  if (text === "指示書") {
    await replyMessage.sendInstructionOptions(replyToken);
    session.step = "selectShijishoOption";
    return;
  }

  if (text === '指示書送付') {
    return reportHandler.handleShijishoUpload(userId, replyToken);
  }

  if (text === '指示書参照') {
    return reportHandler.handleShijishoView(userId, replyToken);
  }

  if (session.step === 'waitingForFilename' && event.message?.type === 'text') {
    let filename = event.message.text.trim();
    // 全角英数字 → 半角英数字
    filename = filename.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
      String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    );
    // 全角スペース + 半角スペース 削除
    filename = filename.replace(/[\u0020\u3000]/g, '');

    // 禁止文字チェック
    // eslint-disable-next-line no-useless-escape
    const invalidChars = /[\/\\:*?"<>|_]/;
    if (!filename || invalidChars.test(filename)) {
      return replyMessage.sendText(
        replyToken,
        '⚠️ ファイル名に使えない文字が含まれています。\n使用できない文字： / \\ : * ? " < > | _'
      );
    }

    // 長さチェック
    if (filename.length > 17) {
      return replyMessage.sendText(
        replyToken,
        '⚠️ ファイル名は全角換算で17文字以内にしてください。\nスペースや記号は無視されます。'
      );
    }

    sessionManager.setTemp(userId, 'fileNameInput', filename);
    const uploadedFilePath = sessionManager.getTemp(userId, 'uploadedFilePath');
    const fileNameInput = sessionManager.getTemp(userId, 'fileNameInput');
    const employeeCode = sessionManager.getTemp(userId, 'employeeCode') || '000';
    const employeeName = sessionManager.getTemp(userId, 'employeeName') || '名無し';
    try {
      const link = await uploadPdfAndGetLink(
        uploadedFilePath,
        fileNameInput,
        employeeCode,
        employeeName,
        userId
      );
      sessionManager.clear(userId);

      return replyMessage.sendText(replyToken,
        `📎アップできました。\nこちらからご確認いただけます：\n${link}`
      );

    } catch (error) {
      console.error('[ERROR] アップロードまたは登録処理に失敗:', error);
      return replyMessage.sendText(replyToken, '⚠️ アップロードまたは登録に失敗しました。もう一度お試しください。');
    }
  }

  // 無効なタイミングでファイル名を送ってきた場合の対応
  if (event.message.type === 'text' && session?.step !== 'waitingForFilename' && /^[^\\/:*?"<>|]{1,100}$/.test(event.message.text.trim())) {
    const text = event.message.text.trim();
    if (!['オーダー', '実績', '指示書', '指示書送付', '指示書参照'].includes(text)) {
      await replyMessage.sendText(replyToken, '⚠️ 先に「指示書送付」を選んでからファイルを送信し、ファイル名を入力してください。');
      return;
    }
  }

  // 🟡 不明なメッセージ応答
  return await replyMessage.sendText(replyToken, '💬 メニューから操作を選んでください。');
}

// ✅ 環境チェッククリア後 → 起動開始
const port = parseInt(process.env.PORT, 10);
app.listen(port, (err) => {
  if (err) {
    const msg = `❌ PORT=${port} でLINE Bot起動に失敗しました。\n${err.message}`;
    console.error(msg);
    notifyAdmin(msg).then(() => process.exit(1));
  } else {
    const msg = `👑 LINE Bot Kingdom が起動しました。\nhttp://localhost:${port}`;
    logger.info(msg);
    notifyAdmin(msg);
  }
});