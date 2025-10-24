// utils/sessionManager.js
// ユーザー単位で一時的な送信状態（画像バッファ、PDF名など）を管理します

// utils/sessionManager.js
const logger = require('./logger');
const sessions = {};
const sql = require('mssql');
const config = require('../config/dbConfig');
const { getEmployeeList } = require('../utils/employeeLoader');

// セッション操作
function initSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      images: [],
      fileName: '',
      step: 'waiting',
      lastAccessed: Date.now()
    };
  }
  return sessions[userId];
}

function getSession(userId) {
  touchSession(userId);
  return sessions[userId] || null;
}

function addImage(userId, imageData) {
  if (!sessions[userId]) initSession(userId);
  sessions[userId].images.push(imageData);
}

function setFileName(userId, name) {
  if (!sessions[userId]) initSession(userId);
  sessions[userId].fileName = name;
}

function setStep(userId, step) {
  if (!sessions[userId]) initSession(userId);
  sessions[userId].step = step;
  touchSession(userId);
}

function clearSession(userId) {
  delete sessions[userId];
}

async function saveSelectedEmployeeSession(userId, code) {
  const employeeList = await getEmployeeList();
  const selected = employeeList.find(e => e.code === code);

  if (!sessions[userId]) sessions[userId] = {};
  sessions[userId].selectedEmployee = selected || { code, name: '名無し' };
}

async function saveSelectedEmployeeToDB(userId, selectedCode) {
  await sql.connect(config);
  await sql.query`
    MERGE INTO [dbo].[UserSelections] AS target
    USING (SELECT ${userId} AS UserID) AS source
    ON target.UserID = source.UserID
    WHEN MATCHED THEN
      UPDATE SET EmployeeCode = ${selectedCode}
    WHEN NOT MATCHED THEN
      INSERT (UserID, EmployeeCode) VALUES (${userId}, ${selectedCode});
  `;
  logger.info(`[SESSION] ${userId} の担当者コードを DB に保存: ${selectedCode}`);
}

async function getSelectedEmployee(userId) {
  await sql.connect(config);
  const result = await sql.query`
    SELECT EmployeeCode FROM [dbo].[UserSelections]
    WHERE UserID = ${userId}
  `;
  return result.recordset[0]?.EmployeeCode || null;
}

function setFileBaseName(userId, fileBaseName) {
  if (!sessions[userId]) sessions[userId] = {};
  sessions[userId].fileBaseName = fileBaseName;
}

function setPdfPath(userId, path) {
  if (!sessions[userId]) sessions[userId] = {};
  sessions[userId].pdfPath = path;
}

function setExcelPath(userId, path) {
  if (!sessions[userId]) sessions[userId] = {};
  sessions[userId].excelPath = path;
}

function setWordPath(userId, path) {
  if (!sessions[userId]) sessions[userId] = {};
  sessions[userId].wordPath = path;
}

function touchSession(userId) {
  if (sessions[userId]) {
    sessions[userId].lastAccessed = Date.now();
  }
}

function setMode(userId, mode,type) {
  sessions[userId] = { mode,type };
}

function setSession(userId, session) {
  sessions[userId] = session;
}

function setTemp(userId, key, value) {
  if (!sessions[userId]) initSession(userId);
  if (!sessions[userId].temp) sessions[userId].temp = {};
  sessions[userId].temp[key] = value;
}

function getTemp(userId, key) {
  return sessions[userId]?.temp?.[key] || null;
}

function clear(userId) {
  delete sessions[userId];
}

// 最後に追加する export にこれも加える
function _getAllSessions() {
  return sessions;
}

// ✅ すべてまとめて export
module.exports = {
  initSession,
  getSession,
  addImage,
  setFileName,
  setStep,
  setFileBaseName,
  setPdfPath,
  setExcelPath,  
  setWordPath,   
  clearSession,
  saveSelectedEmployeeToDB,
  saveSelectedEmployeeSession,
  getSelectedEmployee,
  setMode,
  setSession,
  setTemp,
  getTemp,
  clear,
  _getAllSessions // 🔐 内部セッション全体アクセス用
};
