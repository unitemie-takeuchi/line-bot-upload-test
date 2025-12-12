// handlers/mvReportHandler.js

const logger = require("../utils/logger");
const sessionManager = require("../utils/sessionManager");
const { getEmployeeList, getSelectedEmployeeCode } = require("../utils/employeeLoader");
const { updateUserSelection } = require("../utils/sqlClient");
const { createReportCarousel, createMVEmployeeCarousel } = require("../utils/carouselBuilder");
const reportLoader = require("../utils/reportLoader");
const replyMessage = require("../utils/replyMessage");
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

  // ▼ 前回選んだ担当者をDBに記憶
  await updateUserSelection(userId, employeeCode);

  // ▼ セッション更新
  const session = sessionManager.getSession(userId) || {};
  session.employeeCode = employeeCode;
  session.step = "mvSelectReportType";
  sessionManager.setSession(userId, session);

  // ▼ 報告書種類を取得
  const reportList = await reportLoader.getReportsByMode("報告書");

  // ▼ 種類カルーセル
  const typeCarousel = createReportCarousel(reportList, 0);

  return replyMessage.sendCarousel(replyToken, typeCarousel);
}
// --------------------------------------------------
// ③ 報告書種類を選んだとき
// --------------------------------------------------
async function handleReportTypeSelect(userId, reportType, replyToken) {
  logger.info(`[MV報告書 種類選択] userId=${userId}, reportType=${reportType}`);

  const session = sessionManager.getSession(userId) || {};
  const employeeCode = session.employeeCode;
  const baseUrl = "https://test.unitemie.com/liff/mv-report/index.html";
  // ▼ LIFF URL
  const liffUrl = `${baseUrl}?owner_cd=${employeeCode}&emp=${encodeURIComponent(employeeCode)}`;

  return replyMessage.sendText(
    replyToken,
    `担当者：${employeeCode}\n報告書：${reportType}\n\n承認・否認処理をお願いします：\n${liffUrl}`
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
async function handlePostback(event) {
  const data = event.postback.data;
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const session = sessionManager.getSession(userId) || sessionManager.initSession(userId);

  // 担当者選択
  if (data.startsWith("mvEmpSelect:")) {
    const code = data.replace("mvEmpSelect:", "");
    return await handleEmployeeSelect(userId, code, replyToken);
  }

  // ページ送り
  if (data.startsWith("mvEmpNext:")) {
    const page = parseInt(data.replace("mvEmpNext:", ""), 10);
    return await handleNextEmployeePage(userId, page, replyToken);
  }

  // 種類選択
  if (data.startsWith("mvReport:")) {
    const type = data.replace("mvReport:", "");
    return await handleReportTypeSelect(userId, type, replyToken);
  }

  return; // 無視
}
// --------------------------------------------------
module.exports = {
  handleStartCommand,
  handleEmployeeSelect,
  handleReportTypeSelect,
  handleNextEmployeePage,
  handlePostback
};
