// utils/libreofficeConvert.js
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

let isConverting = false; // グローバルロック

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function convertToPdf(inputFilePath, outputDir) {
  while (isConverting) {
    logger.info('[PDF] 他のPDF変換中。待機します...');
    await sleep(500);
  }
  isConverting = true;
  return new Promise((resolve, reject) => {
    const sofficePath = '"C:/Program Files/LibreOffice/program/soffice.exe"';
    const command = `${sofficePath} --headless --convert-to pdf "${inputFilePath}" --outdir "${outputDir}"`;

    logger.info(`[PDF] LibreOffice変換開始: ${command}`);

    exec(command, async (err, stdout, stderr) => {
      try {
        if (err) {
          logger.error('[PDF] LibreOffice変換失敗:', stderr);
          return reject(err);
        }

        const pdfFileName = path.basename(inputFilePath, path.extname(inputFilePath)) + '.pdf';
        const pdfPath = path.join(outputDir, pdfFileName);

        let retryCount = 0;
        const maxRetries = 10;
        while (!fs.existsSync(pdfPath) && retryCount < maxRetries) {
          logger.warn(`[PDF] PDF未生成、再確認中... (${retryCount + 1}/${maxRetries})`);
          await sleep(500);
          retryCount++;
        }

        if (!fs.existsSync(pdfPath)) {
          return reject(new Error('PDFファイルが生成されていませんでした'));
        }

        logger.info(`[PDF] LibreOffice変換成功: ${pdfPath}`);
        resolve(pdfPath);
      } finally {
        isConverting = false; // ✅ 最後に必ず解除する
      }
    });
  });
}

module.exports = {
  convertToPdf
};