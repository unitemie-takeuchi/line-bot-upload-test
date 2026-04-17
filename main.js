// main.js
require('dotenv').config();
const fs = require('fs');
const { notifyAdmin } = require('./utils/lineNotify');
const mvReportHandler = require("./handlers/mvReportHandler");
const { getEmployeeList, getSelectedEmployeeCode } = require('./utils/employeeLoader');
const { createMVEmployeeCarousel, createListSelectCarousel } = require('./utils/carouselBuilder');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { generateReportPDF } = require('./utils/pdfGenerator');
const dailyCleanup = require('./cleanup-furyou');
const orderListRouter = require('./routes/api/lists/orderList');

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
const path = require('path');
// 静的ファイル
app.use(express.static(path.join(__dirname, 'public')));
// API 用だけ JSON を有効化
app.use('/api', express.json({ limit: '50mb' }));
app.use('/api', express.urlencoded({ limit: '50mb', extended: true }));
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
app.use('/api', require('./routes/api/furyou/liffData'));
app.use('/api/lists', orderListRouter);
app.use('/view-pdf', require('./routes/api/lists/pdfViewer'));

// --- データベースとメールの設定 ---
const sql = require('mssql');
const dbConfig = require('./config/dbConfig');

const transporter = nodemailer.createTransport({
  host: 'sv302.sixcore.ne.jp',
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

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

  if (text === "データ抽出") {
    sessionManager.clear(userId);
    const carousel = createListSelectCarousel();
    return await client.replyMessage(replyToken, carousel);
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

// --- 🕒 11時のバッチ処理を「関数」として定義 ---
const dailyProcess = async () => {
  console.log('--- 11時の締め処理（自動承認＆レポート送信）を開始します ---');
  try {
    let pool = await sql.connect(dbConfig);

    // 1. 【自動承認】まだ何もしていない(00)データを自動承認(11)にする
    // ✅ report_flg はまだ 0 のままだよ（この後のPDFに載せるため）
    const autoApprove = await pool.request().query(`
      UPDATE dbo.T_MV不良報告書
      SET 
        status = '11', 
        processed_dt = GETDATE(),
        reject_reason = NULL 
      WHERE (status = '00' OR status IS NULL OR status = '')
        AND (report_flg = 0 OR report_flg IS NULL)
    `);
    console.log(`✅ 自動承認完了: ${autoApprove.rowsAffected} 件を更新しました。`);

    // 2. 【PDF用データ取得】
    const result = await pool.request().query(`
      SELECT 
        id,
        shop_cd,          -- 🌟追加
        shop_name,        -- 🌟追加
        delivery_date,    -- 🌟追加
        slip_no,          -- 🌟追加
        product_cd,       -- 🌟追加
        origin_name,      -- 🌟産地を追加
        product_name,     -- 🌟追加
        return_qty,       -- 🌟念のため数量も
        status, 
        reject_reason,
        reject_comment,
        processed_dt
      FROM dbo.T_MV不良報告書 
      WHERE (report_flg = 0 OR report_flg IS NULL)
        AND status IN ('10', '11', '20')
      ORDER BY product_cd ASC, slip_no ASC
    `);

    const rows = result.recordset;
    if (rows.length === 0) {
      console.log('ℹ 報告対象のデータがないため、メール送信をスキップします。');
      return;
    }

    // 3. 【PDF作成】
    const pdfBuffer = await generateReportPDF(rows);

    // 4. 【メール送信】
    await transporter.sendMail({
      from: `"不良報告自動配信" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_TO,
      subject: `【自動配信】不良報告 処理結果一覧（${new Date().toLocaleDateString()}）`,
      text: '本日の処理結果レポートを送付します。確認をお願いします。',
      attachments: [{
        filename: `DailyReport_${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdfBuffer
      }]
    });
    console.log('✅ 定期PDFメールを送信しました！');

    // 🚀 5. 【重要：事後処理】報告済みに更新！
    // PDFに載せたデータを一括で report_flg = 1 にするよ
    const finalize = await pool.request().query(`
      UPDATE dbo.T_MV不良報告書
      SET report_flg = 1
      WHERE (report_flg = 0 OR report_flg IS NULL) -- 🌟ここもカッコを追加！
        AND status IN ('10', '11', '20')
    `);
    console.log(`🧹 事後処理完了: ${finalize.rowsAffected} 件を報告済み(1)に更新しました。`);

  } catch (err) {
    console.error('❌ バッチ処理でエラーが発生しました:', err);
  }
};

// 🕒 cronからは定義した関数を呼ぶようにする
//cron.schedule('0 11 * * *', dailyProcess);

// 🚀 13時のスケジュールを追加
//cron.schedule('0 13 * * *', () => {
//  dailyCleanup(); // 部品を呼び出す！
//});

// --- main.js の一番下、app.listen 部分を以下に書き換え ---

/**
 * 🚀 データベース接続とサーバー起動を管理する関数
 * DBが繋がるまで粘り、繋がってから初めてサーバーを公開＆通知するよ！
 */
const startServer = async () => {
  const maxRetries = 10;    // 最大10回リトライ
  const retryInterval = 10000; // 10秒おきにチャレンジ
  let attempts = 0;
  let connected = false;

  console.log('🚀 データベース接続チェックを開始します...');

  while (!connected && attempts < maxRetries) {
    try {
      attempts++;
      // ここで一度、DBに接続できるか試してみる
      await sql.connect(dbConfig);
      console.log('✅ データベース（ミエデンDC）に繋がったよ！');
      connected = true;
    } catch (err) {
      console.error(`❌ DB接続失敗 (${attempts}/${maxRetries}): ${err.message}`);
      
      if (attempts >= maxRetries) {
        // 10回ダメだった時だけ、最後に「諦めました」の通知を送る
        const errorMsg = `❌ 【重大】DBに${maxRetries}回接続できず、起動を断念しました。VPSの状態を確認してください。`;
        logger.error(errorMsg);
        await notifyAdmin(errorMsg);
        process.exit(1); // ここで初めて終了
      }

      // まだ回数があるなら、通知は送らずに「静かに」待機する
      console.log(`${retryInterval / 1000}秒後に再試行するね...`);
      await new Promise(res => setTimeout(res, retryInterval));
    }
  }

  // ーーー ここから下は、DBが繋がった後にだけ実行されるよ ーーー

  app.listen(port, (err) => {
    if (err) {
      const msg = `❌ PORT=${port} でサーバー起動に失敗しました。\n${err.message}`;
      logger.error(msg);
      notifyAdmin(msg).then(() => process.exit(1));
    } else {
      // ✅ ここで送る通知が「最初で最後の1回」になる！
      const msg = `👑 LINE Bot Kingdom が正常に起動しました。\n（データベース接続も確認済みだよ！）`;
      logger.info(msg);
      notifyAdmin(msg); 
    }
  });
};

// 運命の実行！
startServer();