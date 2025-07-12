const { client } = require('../lineClient');

function notifyAdmin(message) {
  const raw = process.env.ADMIN_LINE_USER_IDS || '';
  const userIds = raw.split(',').map(id => id.trim()).filter(Boolean);

  const sendTasks = userIds.map(userId =>
    client.pushMessage(userId, {
      type: 'text',
      text: `⚠️【システム警告】\n${message}`,
    })
  );

  return Promise.allSettled(sendTasks);
}

module.exports = { notifyAdmin };
