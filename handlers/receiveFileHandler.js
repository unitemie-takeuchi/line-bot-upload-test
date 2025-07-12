const fs = require('fs');
const path = require('path');
const sessionManager = require('../utils/sessionManager');
const replyMessage = require('../utils/replyMessage');
const client = require('../utils/client');
const libreofficeConvert = require('../utils/libreofficeConvert');
const logger = require('../utils/logger'); // ✅ 追加

async function handleFileMessage(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const session = sessionManager.getSession(userId);

  const originalFileName = event.message.fileName || 'unknown';
  const extension = originalFileName.split('.').pop().toLowerCase();
  const fileExt = extension;

  logger.info(`[受信] userId=${userId} がファイルをアップロード: ${originalFileName} (${fileExt})`);

  if (session?.step !== 'waitingForUpload' && session?.step !== 'collecting') {
    await replyMessage.sendText(replyToken, '⚠️ 「指示書送付」を選んでからファイルを送信してください。');
    logger.warn(`[無効ステップ] userId=${userId} の現在ステップ: ${session?.step}`);
    return;
  }

  logger.debug('[準備] ファイル種別に応じたメッセージを構築');

  let receivedMsg;
  if (fileExt === 'xlsx' || fileExt === 'xls') {
    receivedMsg = '💬 Excelファイルを受け取りました。\nファイル名を教えてください（全角17文字以内。スペースは無視されます）';
  } else if (fileExt === 'docx' || fileExt === 'doc') {
    receivedMsg = '💬 Wordファイルを受け取りました。\nファイル名を教えてください（全角17文字以内。スペースは無視されます）';
  } else if (fileExt === 'pdf') {
    receivedMsg = '💬 PDFファイルを受け取りました。\nファイル名を教えてください（全角17文字以内。スペースは無視されます）';
  } else {
    receivedMsg = '⚠️ このファイル形式は対応していません。Word、Excel、PDFのみアップロード可能です。';
    await replyMessage.sendText(replyToken, receivedMsg);
    logger.warn(`[未対応形式] userId=${userId} が送信した拡張子: .${fileExt}`);
    return;
  }

  if (receivedMsg) {
    await replyMessage.sendText(replyToken, receivedMsg);
    logger.debug('[送信] ファイル名入力メッセージを送信');
  }

  try {
    const messageId = event.message.id;
    const fileExt = event.message.fileName?.split('.').pop().toLowerCase() || 'pdf';
    let filePath = path.join(__dirname, `../temp/${userId}_${Date.now()}.${fileExt}`);

    const stream = await client.getMessageContent(messageId);
    const fileBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });

    fs.writeFileSync(filePath, fileBuffer);
    logger.info(`[保存] ファイル保存完了: ${filePath}`);

    // ⭐ PDF以外なら変換
    if (fileExt !== 'pdf') {
      try {
        logger.debug(`[変換] PDF変換開始: ${filePath}`);
        const tempDir = path.dirname(filePath);
        const convertedPath = await libreofficeConvert.convertToPdf(filePath, tempDir);
        fs.unlinkSync(filePath);
        filePath = convertedPath;
        logger.info(`[変換成功] PDFに変換済: ${filePath}`);
        sessionManager.setTemp(userId, 'uploadedFilePath', filePath);
      } catch (err) {
        logger.error(`[変換失敗] PDF変換中エラー: ${err.message}\n${err.stack}`);
        return replyMessage.sendText(replyToken, '❌ ファイルのPDF変換に失敗しました。PDF形式で再送してください。');
      }
    }

    const employeeCode = session.selectedEmployee?.code || '000';
    const employeeName = session.selectedEmployee?.name || '名無し';

    sessionManager.setStep(userId, 'waitingForFilename');
    sessionManager.setTemp(userId, 'tempFile', fileBuffer);
    sessionManager.setTemp(userId, 'tempMimeType', event.message.mimeType || 'application/pdf');
    sessionManager.setTemp(userId, 'employeeCode', employeeCode);
    sessionManager.setTemp(userId, 'employeeName', employeeName);
    sessionManager.setTemp(userId, 'uploadedFilePath', filePath);

    logger.info(`[ステップ更新] userId=${userId} → 'waitingForFilename'`);
    logger.debug(`[社員情報] code=${employeeCode}, name=${employeeName}`);

  } catch (err) {
    logger.error(`[処理失敗] ファイル受信処理中のエラー: ${err.message}\n${err.stack}`);
    return replyMessage.replyError(replyToken, '⚠️ ファイルの受信に失敗しました。\n時間をおいて、もう一度お試しください。');
  }
}

module.exports = {
  handleFileMessage
};