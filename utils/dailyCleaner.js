const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const foldersToClean = [
  path.join(__dirname, '../temp'),
  path.join(__dirname, '../uploads')
];

function cleanFolder(folderPath) {
  if (!fs.existsSync(folderPath)) return;
  fs.readdirSync(folderPath).forEach(file => {
    const filePath = path.join(folderPath, file);
    fs.unlink(filePath, (err) => {
      if (err) {
        logger.warn(`[CLEANUP ERROR] ${filePath} - ${err.code || err.message}`);
      } else {
        logger.info(`[CLEANUP] Deleted: ${filePath}`);
      }
    });
  });
}

function scheduleDailyCleanup() {
  const now = new Date();
  const target = new Date();
  target.setHours(9, 0, 0, 0); // 午前9時

  if (now > target) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - now.getTime();
  logger.info(`[SCHEDULER] 初回ファイル削除予定: ${target.toLocaleString()}`);

  setTimeout(() => {
    foldersToClean.forEach(cleanFolder);
    logger.info('[SCHEDULER] 初回削除実行済み');

    // その後、24時間ごとに実行
    setInterval(() => {
      foldersToClean.forEach(cleanFolder);
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

scheduleDailyCleanup();