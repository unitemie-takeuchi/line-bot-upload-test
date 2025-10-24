// utils/reportLoader.js
const logger = require('./logger');
const sql = require('mssql');
const {
  createEmployeeCarousel,
  createTitleCarousel
} = require('./carouselBuilder');
const { getLinkFromOneDrive } = require('../handlers/uploadToOneDrive');
const replyMessage = require('./replyMessage');
const { getEmployeeList, getSelectedEmployeeCode } = require('../utils/employeeLoader');
const { updateUserSelection } = require('../utils/sqlClient');
const sessionManager = require('../utils/sessionManager');
const { getEmployeeByCode } = require('../utils/employeeLoader');

// 🔸 担当CDごとにカルーセルを作成（指示書がある人のみ）
function createEmployeeCarouselFromGroups(reportGroups, page = 0, selectedCode = null, mode = 'order') {
  const employeeList = Object.entries(reportGroups).map(([code, reports]) => {
    const first = Array.isArray(reports) ? reports[0] : reports;

    let name = '（無名）';
    if (mode === 'shijisho') {
      // 指示書モード：ReportNameから社員名を取り出す
      const parts = first?.ReportName?.split('_') || [];
      name = parts.length >= 3 ? parts[2] : '（無名）';
    } else {
      // オーダー・実績モード：普通にemployeeプロパティを見る
      name = first?.employee || '（無名）';
    }

    return { code, name };
  });

  return createEmployeeCarousel(employeeList, page, selectedCode);
}

// 🔸 担当CDが選ばれた後の処理（1件なら即URL、複数なら帳票カルーセル）
async function handleSelectedEmployeeForView(userId, selectedCode, mode, replyToken) {
  const reportsData = await getReportsByMode(mode); // ← 共通関数に統一
  await updateUserSelection(userId, selectedCode);  // ← 履歴保存

  const selectedEmployeeCode = await getSelectedEmployeeCode(userId);
  const employeeList = await getEmployeeList();
  const selectedEmployee = employeeList.find(emp => emp.code === selectedEmployeeCode);
  const employeeName = selectedEmployee ? selectedEmployee.name : 'この担当者';

  let reports;

  if (Array.isArray(reportsData)) {
    // オーダー・実績のように全件からフィルタ
    reports = reportsData.filter(r => r.reportName.startsWith(selectedCode));
  } else {
    // 指示書など（グループ形式）
    reports = reportsData[selectedCode] || [];
  }

  if (reports.length === 0) {
    logger.info(`[帳票なし] ${employeeName}（コード: ${selectedCode}）の帳票は存在しません`);
    return replyMessage.sendText(replyToken, `${employeeName}さんの帳票は見つかりませんでした。`);
  }

  if (reports.length === 1) {
    const fileName = `${reports[0].reportName}.pdf`;
    const fileUrl = await getLinkFromOneDrive(fileName);
    logger.info(`[帳票ヒット] 1件 → ファイル名: ${fileName}`);
    if (fileUrl) {
      return replyMessage.replyWithLink(replyToken, fileUrl);    
    } else {
      return replyMessage.sendText(replyToken, "⚠️ ファイルが見つかりません。もう一度確認してください。");
    }
  } else {
    // 複数 → カルーセル表示
    const carousel = createTitleCarousel(reports);
    logger.info(`[帳票ヒット] ${reports.length}件 → カルーセル送信`);
    return replyMessage.sendCarousel(replyToken, carousel);
  }
}

// 🔸 帳票名が選ばれたときの処理（URLを返却）
async function handleSelectedReportName(userId, messageText, replyToken) {
  // 🔍 帳票のラベルを削除（前方一致）
  const matched = messageText.match(/^帳票(?:名)?[:：]?\s*(.+)$/);
  if (!matched || !matched[1]) {
    return replyMessage.sendText(replyToken, '⚠️ 帳票名の形式が正しくありません。もう一度選択してください。');
  }
  const cleanName = matched[1]; // 例：「担当者別集荷リスト【納品日別】」

  // ✅ sessionを先に宣言
  const session = sessionManager.getSession(userId);
  const employeeCode = session?.selectedEmployee?.code;

  // 🧠 DBから社員名を取得
  const employee = await getEmployeeByCode(employeeCode);
  if (!employee || !employee.EmployeeName) {
    return replyMessage.sendText(replyToken, '⚠️ 社員名の取得に失敗しました。');
  }
  const employeeName = employee.EmployeeName;
  let fileName;

  // 📦 現在のセッション取得
  const mode = session?.reportMode || '';
  logger.debug(`[MODE] 選択されたモード: ${mode}`);

  if (mode === '指示書') {
    // ✅ 指示書 → 既に employeeCode_タイトル_氏名 が含まれてる前提
    fileName = `${cleanName}.pdf`;
  } else {
    // 📄 正式なファイル名を生成（例：035_帳票名_佐藤.pdf）
    if (cleanName.includes("部門別実績")) {
      // 🟡 特例ファイル名：000_帳票名.pdf
      fileName = `000_${cleanName}.pdf`;
    } else {
      // 📄 通常ファイル名：社員番号_帳票名_社員名.pdf
      fileName = `${employeeCode}_${cleanName}_${employeeName}.pdf`;
    }
  }
  logger.debug(`[ファイル検索] 対象: ${fileName}`);
  let fileUrl = await getLinkFromOneDrive(fileName);

  if (!fileUrl) {
    const fallbackFileName = `OLD_${fileName}`;
    logger.debug(`[ファイル検索] OLDファイルを検索: ${fallbackFileName}`);
    fileUrl = await getLinkFromOneDrive(fallbackFileName);
  }

  if (fileUrl) {
    const liffViewerUrl = `https://liff.line.me/2007688662-pAbmBl6r?pdf=${encodeURIComponent(fileUrl)}`;
    return replyMessage.replyWithLink(replyToken, fileUrl);
  } else {
    logger.warn(`[ファイル検索失敗] ${fileName} / OLD_${fileName}`);
    return replyMessage.sendText(replyToken, "⚠️ ファイルが見つかりません。もう一度確認してください。");
  }
}

// 🔹 モードに応じて帳票一覧 or グループ化を返す共通関数
async function getReportsByMode(mode, reportMode) {
  logger.debug(`[DB] getReportsByMode: mode=${mode}, reportMode=${reportMode}`);
  try {
    const pool = await sql.connect({
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      options: { encrypt: true, trustServerCertificate: true },
    });

    let whereClause = '';
    if (['指示書', 'オーダー', '実績'].includes(mode)) {
      whereClause = `WHERE ReportSelect = '${mode}'`;
    }
    logger.debug(`[DB] whereClause = ${whereClause}`);
    const sqlQuery = `
      SELECT ReportName, WirteDate as WriteDate , WirteDate
      FROM [dbo].[Reports]
      ${whereClause}
      ORDER BY WirteDate DESC
    `;
    logger.debug(`[DB] SQL実行: ${sqlQuery}`);
    const result = await pool.request().query(sqlQuery);
    const recordset = result.recordset;

    // 🔧 モードごとに戻り値の型を保証
    if (mode === '指示書') {
      const grouped = {};
      for (const row of recordset) {
        const parts = row.ReportName.split('_');
        if (parts.length < 3) continue;

        const code = parts[0].padStart(3, '0');
        const report = {
          reportName: row.ReportName,
          writeDate: row.WriteDate,
          title: parts[1],
          employee: parts[2]
        };

        if (!grouped[code]) grouped[code] = [];
        grouped[code].push(report);
      }

      return grouped; // ← オブジェクト保証
    } else {
      return recordset; // ← 配列保証（オーダー・実績）
    }

  } catch (err) {
    logger.error('[DB] getReportsByMode エラー:', err);
    return mode === '指示書' ? {} : [];
  }
}

// 🔸 指示書など：社員コードでグルーピングする処理
function groupReportsByEmployee(records) {
  const grouped = {};

  for (const row of records) {
    const parts = row.ReportName.split('_');
    if (parts.length < 3) continue;

    const code = parts[0].padStart(3, '0');
    const report = {
      reportName: row.ReportName,
      writeDate: row.WriteDate,
      title: parts[1],
      employee: parts[2]
    };

    if (!grouped[code]) grouped[code] = [];
    grouped[code].push(report);
  }

  return grouped;
}

module.exports = {
  createEmployeeCarouselFromGroups,
  handleSelectedEmployeeForView,
  handleSelectedReportName,
  getReportsByMode,
  groupReportsByEmployee
};
