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
      text: `📢 【新機能】不良報告書の確認機能を追加しました！

いつもお疲れ様です。
LINEから「マックスバリュ不良報告書」の画像が直接確認できるようになりました。
本日より運用を開始します。

■ 操作手順書はこちら（PDF）
https://unitemie.com/liff/mv-report/mvfuryou_manual.pdf

■ 使いかた
届いたメッセージのリンクをタップすると、報告書の詳細と画像が表示されます。

現場の効率化にぜひお役立てください！
ご不明な点は竹内までお願いします。`
    });

    console.log('📢 オーダーリスト追加のお知らせを送信しました');
  } catch (err) {
    console.error('❌ 通知の送信に失敗しました:', err);
  }
}

sendBroadcast();
