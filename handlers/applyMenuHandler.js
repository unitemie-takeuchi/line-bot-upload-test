const line = require('@line/bot-sdk');

async function sendApplicationMenu(replyToken, client) {
  return client.replyMessage(replyToken, {
    type: 'template',
    altText: '申請メニュー',
    template: {
      type: 'carousel',
      columns: [
        {
          title: '休暇申請',
          text: '有休・遅刻・早退・外出はこちら',
          actions: [
            {
              type: 'uri',
              label: '休暇申請する',
              uri: 'https://liff.line.me/2007688662-ElLglqWR'
            }
          ]
        },
        // 出張申請なども追加可
      ]
    }
  });
}

module.exports = { sendApplicationMenu };
