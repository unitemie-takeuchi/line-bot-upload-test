// utils/sqlClient.js
const logger = require('./logger');
const sql = require('mssql');
const dbconfig = require('../config/dbConfig');

const pool = new sql.ConnectionPool(dbconfig); // ← この行が必要！
const poolPromise = pool
  .connect()
  .then(pool => {
    logger.info('[DB] SQL Serverに接続成功');
    return pool;
  })
  .catch(err => {
    logger.error('[DB] データベース接続失敗:', err);
    throw err;
  });

logger.debug('[DB] Loaded DB Config:', dbconfig);
if (!dbconfig.server || typeof dbconfig.server !== 'string') {
  logger.error('[FATAL] SQL_SERVERが無効または未設定です');
  throw new Error('SQL_SERVER is not defined correctly in the .env or dbConfig.js');
}

async function insertReportRecord({ reportName, reportSelect, wirteDate }) {
  logger.debug(`[DB] insertReportRecord: Raw日付=${wirteDate}, 書式=${formatDateJapanese(wirteDate)}`);
  try {
    const pool = await poolPromise;
    const deleteQuery = `
      DELETE FROM Reports 
      WHERE reportName = @reportName AND reportSelect = @reportSelect
    `;
    await pool.request()
      .input('reportName', sql.NVarChar, reportName)
      .input('reportSelect', sql.NVarChar, reportSelect)
      .query(deleteQuery);

    const insertQuery = `
      INSERT INTO Reports (reportName, reportSelect, wirteDate)
      VALUES (@reportName, @reportSelect, @wirteDate)
    `;
    await pool.request()
      .input('reportName', sql.NVarChar, reportName)
      .input('reportSelect', sql.NVarChar, reportSelect)
      .input('wirteDate', sql.NVarChar, formatDateJapanese(wirteDate))
      .query(insertQuery);

    return true;
  } catch (err) {
    logger.error('[DB] insertReportRecord失敗:', err);
    return false;
  }
}

function formatDateJapanese(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    console.error('[ERROR] 無効な日付が渡されました:', date);
    return '日付不明';
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  const second = date.getSeconds().toString().padStart(2, '0');

  return `${year}年${month}月${day}日 ${hour}:${minute}:${second} 作成`;
}

async function updateUserSelection(userId, employeeCode) {
  try {
    const pool = await poolPromise;

    const checkQuery = `
      SELECT COUNT(*) AS count 
      FROM UserSelections 
      WHERE UserID = @userId;
    `;
    const checkResult = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query(checkQuery);

    if (checkResult.recordset[0].count > 0) {
      // 存在すれば更新
      const updateQuery = `
        UPDATE UserSelections
        SET EmployeeCode = @employeeCode
        WHERE UserID = @userId;
      `;
      await pool.request()
        .input('userId', sql.NVarChar, userId)
        .input('employeeCode', sql.NVarChar, employeeCode)
        .query(updateQuery);
    } else {
      // 存在しなければ追加
      const insertQuery = `
        INSERT INTO UserSelections (UserID, EmployeeCode)
        VALUES (@userId, @employeeCode);
      `;
      await pool.request()
        .input('userId', sql.NVarChar, userId)
        .input('employeeCode', sql.NVarChar, employeeCode)
        .query(insertQuery);
    }
  } catch (err) {
    logger.error(`[DB] updateUserSelection失敗: userId=${userId}, employeeCode=${employeeCode}`, err);
  }
}

async function query(queryText, params = {}) {
  const pool = await sql.connect(dbconfig);
  const request = pool.request();

  for (const [key, value] of Object.entries(params)) {
    request.input(key, sql.NVarChar, value);
  }
  logger.debug(`[DB] SQL実行: ${queryText}, パラメータ: ${JSON.stringify(params)}`);
  const result = await request.query(queryText);
  return result.recordset;
}

module.exports = {
  sql,
  poolPromise,
  query,
  insertReportRecord,
  formatDateJapanese,
  updateUserSelection
};
