// handlers/uploadToOneDrive.js
require('isomorphic-fetch');

const fs = require('fs');
//const path = require('path');
const axios = require('axios');
const graphAuth = require('../config/graphAuth');
const { sanitizeFileName } = require('../utils/fileHelper');
const { insertReportRecord } = require('../utils/sqlClient');
const logger = require('../utils/logger'); // ✅ 追加
const ONEDRIVE_FOLDER = '/';

async function uploadPdfAndGetLink(pdfPath, baseName, employeeCode, employeeName, userId) {
  const accessToken = await graphAuth.getAccessToken();

  // ファイル名を整形し、最終ファイル名を生成
  const cleanName = sanitizeFileName(baseName);
  const finalName = `${employeeCode}_${cleanName}_${employeeName}.pdf`;
  const filePath = `${ONEDRIVE_FOLDER}${finalName}`;
  logger.info(`[開始] アップロード開始: ${pdfPath} → ${finalName} (userId=${userId})`);
  try {
    // 既存ファイル → OLD_ にリネーム
    await axios.patch(`https://graph.microsoft.com/v1.0/drives/${process.env.OAUTH_DRIVE_ID}/root:/${finalName}`, {
      name: `OLD_${finalName}`
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => { /* 存在しなければ無視OK */ });
    logger.debug(`[スキップ] ${finalName} は存在しなかったためリネーム不要`);
    // ファイルアップロード
    const fileBuffer = fs.readFileSync(pdfPath);
    logger.debug(`[読込] ファイル読み込み成功: ${pdfPath} (${fileBuffer.length} bytes)`);
    await axios.put(`https://graph.microsoft.com/v1.0/drives/${process.env.OAUTH_DRIVE_ID}/root:${filePath}:/content`, fileBuffer, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/pdf'
      }, timeout: 60000
    }
    );
    logger.info(`[完了] OneDriveアップロード成功: ${finalName}`);
    // 共有リンク取得
    const response = await axios.post(`https://graph.microsoft.com/v1.0/drives/${process.env.OAUTH_DRIVE_ID}/root:${filePath}:/createLink`, {
      type: 'view',
      scope: 'anonymous'
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const shareLink = response?.data?.link?.webUrl;
    if (!shareLink) {
      logger.warn(`[警告] 共有リンクが取得できませんでした: ${finalName}`);
      throw new Error('共有リンクの取得に失敗しました');
    }
    logger.info(`[成功] 共有リンク取得: ${shareLink}`);

    // SQL登録
    const rawName = finalName.replace(/\.pdf$/i, '');
    const now = new Date();

    await insertReportRecord({
      reportName: rawName,
      reportSelect: '指示書',
      wirteDate: now
    });
    logger.debug(`[SQL登録] ${rawName} を report に追加 (種別=指示書, 日時=${now.toISOString()})`);

    // テキストログ保存
    const logLine = `[INFO] ${new Date().toISOString()} - ${userId}, ${employeeCode}, ${finalName}, uploaded\n`;
    logger.debug(`[ログ追記] upload_log.txt に記録: ${finalName}`);
    fs.appendFileSync('upload_log.txt', logLine);

    // 🎉 最後に返す！
    return shareLink;

  } catch (err) {
    logger.error(`[ERROR] OneDrive upload or registration failed: ${err.message}\n${err.stack}`);
    throw err;
  }
}

const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');

async function getLinkFromOneDrive(reportName) {
  const resolvedFileName = reportName.endsWith('.pdf')
    ? reportName
    : `${reportName}.pdf`;
  try {
    const client = await getGraphClient();
    const driveId = process.env.OAUTH_DRIVE_ID;

    logger.info(`[リンク取得] ${resolvedFileName} の OneDriveリンクを取得開始`);

    const item = await client
      .api(`/drives/${driveId}/root:/${resolvedFileName}`)
      .get();
    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    logger.info(`[成功] downloadUrl取得完了: ${downloadUrl}`);
    return downloadUrl || null;
  } catch (err) {
    logger.error(`[ERROR] getLinkFromOneDrive failed: ${err.message}\n${err.stack}`);
    return null;
  }
}

async function getGraphClient() {
  const accessToken = await graphAuth.getAccessToken(); // ← ここを修正！
  const client = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    }
  });
  return client;
}

module.exports = {
  uploadPdfAndGetLink,
  getLinkFromOneDrive
};
