// handlers/mvReportHandler.js

const logger = require("../utils/logger");
const sessionManager = require("../utils/sessionManager");
const { getEmployeeList, getSelectedEmployeeCode } = require("../utils/employeeLoader");
const { updateUserSelection } = require("../utils/sqlClient");
const { createReportCarousel, createMVEmployeeCarousel } = require("../utils/carouselBuilder");
const reportLoader = require("../utils/reportLoader");
const replyMessage = require("../utils/replyMessage");
const sql = require('mssql');
const dbConfig = require('../config/dbConfig');

// --------------------------------------------------
// ① 「報告書」→ 最初に呼ばれる場所
// --------------------------------------------------
async function handleStartCommand(userId, replyToken) {
  sessionManager.clear(userId);
  sessionManager.setStep(userId, "mvSelectEmployee");

  const employees = await getEmployeeList();
  const selectedCode = await getSelectedEmployeeCode(userId);

  // ▼ 並び替え結果を取得
  const { carousel, sortedEmployees } = createMVEmployeeCarousel(employees, 0, selectedCode);

  // ▼ 正しいページを計算（ソート後の配列で）
  let page = 0;
  if (selectedCode) {
    const idx = sortedEmployees.findIndex(e => e.code === selectedCode);
    if (idx >= 0) page = Math.floor(idx / 5);
  }

  // ▼ 正しいページで作り直す
  const { carousel: fixedCarousel } = createMVEmployeeCarousel(sortedEmployees, page, selectedCode);

  return replyMessage.sendCarousel(replyToken, fixedCarousel);
}
// --------------------------------------------------
// ② 担当者を選んだとき
// --------------------------------------------------
async function handleEmployeeSelect(userId, employeeCode, replyToken) {
  logger.info(`[MV報告書 担当者選択] userId=${userId}, employee=${employeeCode}`);

  await updateUserSelection(userId, employeeCode);

  const today = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo'
  }).format(new Date()).replace(/\//g, '-');

  let hasData = false;
  let employeeName = ""; // ここで名前を保持するよ

  try {
    let pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('empCode', sql.VarChar, employeeCode)
      .input('today', sql.VarChar, today)
      .query(`
        SELECT TOP 1 pdf_file_name 
        FROM dbo.T_MV不良報告書 
        WHERE owner_cd = @empCode 
          AND CONVERT(varchar, import_dt, 23) >= @today
      `);

    if (result.recordset.length > 0) {
      hasData = true;
      const fileName = result.recordset[0].pdf_file_name || "";
      const parts = fileName.split('_');
      if (parts.length >= 3) {
        employeeName = parts[2].replace('.pdf', '');
      }
    }

    // 🌟【流用プランB！】データがなかったら、名簿から名前を探す
    if (!employeeName) {
      const employees = await getEmployeeList(); // これを流用！
      const emp = employees.find(e => e.code === employeeCode);
      employeeName = emp ? emp.name : employeeCode; // 名簿にあれば名前、なければコード
    }

  } catch (err) {
    logger.error("DBチェックエラー:", err);
    hasData = true;
  }

  if (!hasData) {
    return replyMessage.sendText(
      replyToken,
      `${employeeName} さん\n本日の報告書はありません。`
    );
  }

  // ▼ セッション更新
  const session = sessionManager.getSession(userId) || {};
  session.employeeCode = employeeCode;
  session.step = "mvSelectReportType";
  sessionManager.setSession(userId, session);

  // ▼ 報告書種類を取得
  const reportList = await reportLoader.getReportsByMode("報告書");

  if (!reportList || reportList.length === 0) {
    logger.warn(`[MV報告書] 選択できる報告書の種類がDBにありませんでした。`);
    return replyMessage.sendText(replyToken, "【お知らせ】\n該当する報告書はありません。");
  }

  const typeCarousel = createReportCarousel(reportList, 0);
  return replyMessage.sendCarousel(replyToken, typeCarousel);
}
// --------------------------------------------------
// ③ 報告書種類を選んだとき
// --------------------------------------------------
async function handleReportTypeSelect(userId, reportType, replyToken, employeeCode) {
  // 🌟 名前の取得もここで行う
  const employees = await getEmployeeList();
  const emp = employees.find(e => e.code === employeeCode);
  const employeeName = emp ? emp.name : employeeCode;

  const LIFF_ID = "2007688662-6dk5WiCy";
  const liffUrl = `https://liff.line.me/${LIFF_ID}?owner_cd=${employeeCode}&emp=${encodeURIComponent(employeeCode)}`;

  return replyMessage.sendText(
    replyToken,
    `担当者：${employeeName} さん\n報告書：${reportType}\n\n承認・否認処理をお願いします：\n${liffUrl}`
  );
}
// --------------------------------------------------
// ④ 次へ ▶ ページ送り
// --------------------------------------------------
async function handleNextEmployeePage(userId, page, replyToken) {
  const employees = await getEmployeeList();
  const selectedCode = await getSelectedEmployeeCode(userId);

  // ▼ ソート後の配列を取得
  const { carousel } = createMVEmployeeCarousel(employees, page, selectedCode);

  return replyMessage.sendCarousel(replyToken, carousel);
}
// --------------------------------------------------
// ⑤ main.js から丸投げする共通 postback エントリ
// --------------------------------------------------
// handlers/mvReportHandler.js の一番下にある handlePostback を修正

async function handlePostback(event) {
  const data = event.postback.data;
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  const selectedCode = await getSelectedEmployeeCode(userId);

  // 1. 担当者選択
  if (data.startsWith("mvEmpSelect:")) {
    const code = data.replace("mvEmpSelect:", "");
    return await handleEmployeeSelect(userId, code, replyToken);
  }

  // 🌟 2. ここを追加！ ページ送り (mvEmpNext:)
  if (data.startsWith("mvEmpNext:")) {
    const page = parseInt(data.replace("mvEmpNext:", ""), 10);
    return await handleNextEmployeePage(userId, page, replyToken);
  }

  // 3. 報告書種類選択
  if (data.startsWith("mvReport:")) {
    const type = data.replace("mvReport:", "");
    const code = selectedCode;

    if (!code) {
      return replyMessage.sendText(replyToken, "⚠️ 担当者が選択されていません。最初から「報告書」と送ってください。");
    }

    return await handleReportTypeSelect(userId, type, replyToken, code);
  }
}
// --------------------------------------------------
module.exports = {
  handleStartCommand,
  handleEmployeeSelect,
  handleReportTypeSelect,
  handleNextEmployeePage,
  handlePostback
};
