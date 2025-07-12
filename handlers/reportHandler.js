// handlers/reportHandler.js

const sessionManager = require('../utils/sessionManager');
const { saveSelectedEmployeeToDB, saveSelectedEmployeeSession } = require('../utils/sessionManager');
const { getEmployeeList, getSelectedEmployeeCode } = require('../utils/employeeLoader');
const { getLinkFromOneDrive } = require('../handlers/uploadToOneDrive');
const { getReportsByMode, handleSelectedEmployeeForView, handleSelectedReportName, createEmployeeCarouselFromGroups } = require('../utils/reportLoader');
const { createEmployeeCarousel, createTitleCarousel } = require('../utils/carouselBuilder');
const replyMessage = require('../utils/replyMessage');
const client = require('../utils/client');
const { updateUserSelection } = require('../utils/sqlClient');
const logger = require('../utils/logger'); // ✅ 追加

/**
 * オーダー・実績の起点となる社員カルーセルを表示
 */
async function handleStartCommand(userId, replyToken, type) {
  logger.info(`[起動] handleStartCommand: userId=${userId}, type=${type}`);
  sessionManager.setStep(userId, 'selectEmployee');
  sessionManager.setMode(userId, 'view', type);

  const current = sessionManager.getSession(userId) || {};
  sessionManager.setSession(userId, { ...current, step: 'selectEmployee' });

  const selectedCode = await getSelectedEmployeeCode(userId);
  const employeeList = await getEmployeeList();
  const carousel = createEmployeeCarousel(employeeList, 0, selectedCode);

  return replyMessage.sendCarousel(replyToken, carousel);
}

/**
 * 社員選択後に帳票カルーセルを表示
 */
async function handleEmployeeSelect(userId, employeeCode, replyToken) {
  const session = sessionManager.getSession(userId);
  logger.debug(`[選択] userId=${userId}, employeeCode=${employeeCode}`);
  logger.debug(`[モード] ${session.mode}, [帳票種別] ${session.reportMode}`);
  if (!session) {
    console.warn(`[WARN] No session found for userId=${userId}`);
    return replyMessage.replyError(replyToken, '💬 操作情報が消えてしまいました。\nもう一度、最初からやり直してください。');
  }
  session.selectedEmployee = { code: employeeCode };
  await saveSelectedEmployeeToDB(userId, employeeCode);
  sessionManager.setStep(userId, 'selectReport');
  const type = session.type || session.reportMode;
  const reports = await getReportsByMode(type, session.mode);

  if (!reports || (Array.isArray(reports) && reports.length === 0) || (!Array.isArray(reports) && Object.keys(reports).length === 0)) {
    logger.warn(`[空データ] 該当帳票なし: userId=${userId}, type=${type}`);
    return replyMessage.sendText(replyToken, '📄 該当する帳票が見つかりませんでした。');
  }

  if (Array.isArray(reports)) {
    // 🟦 オーダー・実績 → タイトルカルーセル
    const carousel = createTitleCarousel(reports);
    return replyMessage.sendCarousel(replyToken, carousel);
  } else {
    // 🟢 指示書 → 社員別カルーセル
    const employeeReports = reports[employeeCode] || [];
    if (employeeReports.length === 0) {
      logger.warn(`[空データ] 該当帳票なし: userId=${userId}, type=${type}`);
      return replyMessage.sendText(replyToken, '📄 該当する帳票が見つかりませんでした。');
    }

    if (employeeReports.length === 1) {
      const report = employeeReports[0];
      return handleReportSelection(userId, report.reportName, replyToken);
    }

    return replyMessage.sendReportCarousel(userId, replyToken, employeeReports, 0);
  }
}

/**
 * 帳票を選択して OneDrive リンクを返信
 */
async function handleReportSelection(userId, reportName, replyToken) {
  const session = sessionManager.getSession(userId);
  if (!session?.selectedEmployee) {
    return replyMessage.sendText(replyToken, '⚠️ 先に社員を選択してください。');
  }
  const url = await getLinkFromOneDrive(reportName);
  if (!url) {
    logger.info(`[帳票選択] userId=${userId}, reportName=${reportName}`);
    logger.warn(`[ファイル未検出] ${reportName} に該当するURLが存在しません`);
    return replyMessage.sendText(replyToken, `⚠️ [${reportName}] のファイルは見つかりませんでした。`);
  }

  return replyMessage.replyWithLink(replyToken, url);
}

/**
 * カルーセルのページ切り替え（社員）
 */
async function handleNextEmployeePage(userId, page, replyToken) {
  const session = sessionManager.getSession(userId);
  const selectedCode = await getSelectedEmployeeCode(userId);
  const type = session.reportMode || session.type;

  if (type === '指示書' && session?.mode === 'upload') {
    // 🔧 指示書送付モード：全社員を表示
    const employees = await getEmployeeList();
    const carousel = createEmployeeCarousel(employees, page, selectedCode);
    return replyMessage.sendCarousel(replyToken, carousel);
  } else if (type === '指示書') {
    const reportGroups = await getReportsByMode(type, session.mode); // ✅ 修正ポイント
    const carousel = createEmployeeCarouselFromGroups(reportGroups, page, selectedCode);
    return replyMessage.sendCarousel(replyToken, carousel);
  } else {
    const employees = await getEmployeeList();
    const carousel = createEmployeeCarousel(employees, page, selectedCode);
    return replyMessage.sendCarousel(replyToken, carousel);
  }
}

// 🆕 指示書送付 → 担当者選択カルーセルを表示
async function handleShijishoUpload(userId, replyToken) {
  try {
    // モードとステップを初期化
    sessionManager.setMode(userId, 'upload', "指示書");
    sessionManager.setStep(userId, 'selectEmployee');
    logger.info(`[開始] 指示書アップロード用カルーセル表示: userId=${userId}`);
    // 社員リストを取得してカルーセルを作成
    const employees = await getEmployeeList();
    const selectedCode = await getSelectedEmployeeCode(userId);
    const carousel = createEmployeeCarousel(employees, 0, selectedCode); // ⭐先頭ソート付き

    // カルーセルを返す
    return client.replyMessage(replyToken, carousel);
  } catch (err) {
    logger.error(`[ERROR] handleShijishoUpload failed: ${err.message}\n${err.stack}`);
    return replyMessage.sendText(replyToken, '⚠️ 社員情報の取得に失敗しました。もう一度お試しください。');
  }
}

// 新関数：指示書参照スタート（社員カルーセル）
async function handleShijishoView(userId, replyToken) {
  const session = sessionManager.getSession(userId);
  session.mode = 'view';
  session.reportMode = '指示書';
  session.step = 'selectEmployee';

  const grouped = await getReportsByMode(session.reportMode, session.mode); // ✅ 修正ポイント
  const selectedCode = await getSelectedEmployeeCode(userId);
  const carousel = createEmployeeCarouselFromGroups(grouped, 0, selectedCode);

  session.filteredEmployees = Object.entries(grouped).map(([, reports]) => {
    // 単独オブジェクトの想定
    const report = Array.isArray(reports) ? reports[0] : reports;
    const parts = report?.ReportName?.split('_') || [];
    return {
      code: parts[0] || '000',
      name: parts[2]?.replace(/\.pdf$/i, '') || '（無名）'  // .pdf を除去
    };
  });
  return replyMessage.sendCarousel(replyToken, carousel);
}

// 新関数：社員選択（帳票カルーセルへ）
async function handleShijishoEmployeeSelect(userId, employeeCode, replyToken) {
  const session = sessionManager.getSession(userId);
  if (session?.mode === 'view') {
    return await handleSelectedEmployeeForView(userId, employeeCode, session.mode, replyToken);
  }
}

// 新関数：帳票選択（OneDriveリンク）
async function handleShijishoReportSelect(userId, reportName, replyToken) {
  const session = sessionManager.getSession(userId);
  if (session?.mode === 'view') {
    return await handleSelectedReportName(reportName, replyToken);
  }
}

async function handleUploadEmployeeSelection(userId, text, replyToken) {
  logger.info(`[入力] 社員コード入力: userId=${userId}, text=${text}`);
  try {
    // 3桁の社員コードか確認
    if (!/^\d{3}$/.test(text)) {
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '⚠️ 社員コードは3桁の数字で入力してください。',
      });
    }

    // セッションに保存
    await saveSelectedEmployeeSession(userId, text);
    await updateUserSelection(userId, text);

    // セッションのステップを collecting に進める
    sessionManager.setStep(userId, 'collecting');

    // 社員名を取得
    const employeeList = await getEmployeeList();
    const selectedEmployee = employeeList.find(emp => emp.code === text);

    const message = selectedEmployee
      ? `💬 ${selectedEmployee.name}さん、指示書を送ってください。`
      : `💬「${text}」を選択しました。\n指示書を送ってください。`;

    return client.replyMessage(replyToken, {
      type: 'text',
      text: message,
    });

  } catch (err) {
    logger.error(`[ERROR] handleUploadEmployeeSelection: ${err.message}\n${err.stack}`);
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '⚠️ 問題が発生しました。ご不明な点は竹内までご連絡ください。',
    });
  }
}

module.exports = {
  handleStartCommand,
  handleEmployeeSelect,
  handleReportSelection,
  handleNextEmployeePage,
  handleShijishoUpload,   // ←追加
  handleShijishoView,      // ←追加
  handleShijishoEmployeeSelect,
  handleShijishoReportSelect,
  handleUploadEmployeeSelection
};