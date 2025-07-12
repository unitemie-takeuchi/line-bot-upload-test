const sql = require('mssql');
const db = require('./sqlClient');
const logger = require('./logger');

// 社員一覧を取得（EmployeeCodeとEmployeeName）
async function getEmployeeList() {
  try {
    const pool = await sql.connect({
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    });

    const result = await pool.request().query(`
      SELECT [EmployeeCode], [EmployeeName]
      FROM [dbo].[Employees]
      ORDER BY [EmployeeCode]
    `);

    const mapped = result.recordset.map(row => ({
      code: row.EmployeeCode,
      name: row.EmployeeName
    }));

    logger.info(`[DB] 社員一覧取得成功: ${mapped.length}件`);

    return mapped;
  } catch (err) {
    logger.error(`[ERROR] getEmployeeList failed: ${err.message}\n${err.stack}`);
    return [];
  }
}


// ユーザーごとの選択済み社員コードを取得
async function getSelectedEmployeeCode(userId) {
  try {
    logger.info(`[DB] getSelectedEmployeeCode: userId = ${userId}`);
    const pool = await sql.connect({
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    });

    const result = await pool.request()
      .input('UserId', sql.NVarChar, userId)
      .query(`
        SELECT EmployeeCode FROM UserSelections
        WHERE UserID = @UserId
      `);
    const code = result.recordset[0]?.EmployeeCode || null;
    logger.debug(`[DB] getSelectedEmployeeCode: 結果 = ${code}`);
    if (result.recordset.length > 0) {
      return result.recordset[0].EmployeeCode;
    } else {
      return null;
    }
  } catch (err) {
    logger.error('[ERROR] getSelectedEmployeeCode:', err);
    return null;
  }
}

// 🔍 社員コードから社員情報を取得
async function getEmployeeByCode(employeeCode) {
  try {
    logger.info(`[DB] getEmployeeByCode: 検索 = ${employeeCode}`);
    const query = `
      SELECT EmployeeCode, EmployeeName
      FROM Employees
      WHERE EmployeeCode = @employeeCode
    `;

    const result = await db.query(query, { employeeCode });
    const employee = result[0] || null;
    logger.debug(`[DB] getEmployeeByCode: 結果 = ${employee ? 'あり' : 'なし'}`);
    return employee;
  } catch (error) {
    logger.error('[ERROR] getEmployeeByCode:', error);
    return null;
  }
}

module.exports = {
  getEmployeeList,
  getSelectedEmployeeCode,
  getEmployeeByCode
};
