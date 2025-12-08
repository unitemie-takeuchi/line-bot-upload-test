// notify-users.js
require('dotenv').config({ path: '../.env' });
const { Client } = require('@line/bot-sdk');

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

async function sendBroadcast() {
  try {
    await client.broadcast({
      type: 'text',
      text: `📢 オーダーリスト追加のご連絡

昨日より、新しい帳票「MV納品日別得意先別受注集計表」を追加しました。

納品日順に、店直・XDごとに店別の配分状況をご確認いただけます。
また、店舗名に「★」が付いている店舗は、店直対応が可能な店舗です。

ぜひご活用ください。
ご要望などございましたら、竹内までお気軽にお知らせください。`
    });

    console.log('📢 オーダーリスト追加のお知らせを送信しました');
  } catch (err) {
    console.error('❌ 通知の送信に失敗しました:', err);
  }
}

sendBroadcast();
