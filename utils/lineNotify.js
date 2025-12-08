// utils/lineNotify.js

const { client } = require('../lineClient');
const logger = require('./logger');

function notifyAdmin(message) {
  const raw = process.env.ADMIN_LINE_USER_IDS || '';
  const userIds = raw.split(',').map(id => id.trim()).filter(Boolean);

  // 💡 本番環境だけ送信、それ以外はログだけにする
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[TEST通知] ${message}`);
    return Promise.resolve(); // 何もしないがPromiseは返す
  }

  const sendTasks = userIds.map(userId =>
    client.pushMessage(userId, {
      type: 'text',
      text: `⚠️【システム警告】\n${message}`,
    }).catch(err => {
      logger.error(`❌ LINE通知失敗（userId=${userId}）: ${err}`);
    })
  );

  return Promise.allSettled(sendTasks);
}

module.exports = { notifyAdmin };
