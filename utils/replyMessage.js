// utils/replyMessage.js
const logger = require('./logger');
const { getEmployeeList, getSelectedEmployeeCode } = require('../utils/employeeLoader');
const { createEmployeeCarousel } = require('../utils/carouselBuilder');
const line = require('@line/bot-sdk');
const { storeShortLink } = require('../utils/shortlinkController');
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

function sendText(replyToken, text) {
  const messages = Array.isArray(text)
    ? text
    : [{ type: 'text', text }];
  return client.replyMessage(replyToken, messages);
}

function replyError(replyToken, message) {
  logger.error('[LINE] エラーメッセージ送信:', message);
  return client.replyMessage(replyToken, {
    type: 'text',
    text: message || '⚠️ うまくいかなかったので、もう一度試してください。'
  });
}

function sendInstructionOptions(replyToken) {
  const message = {
    type: "template",
    altText: "指示書操作の選択",
    template: {
      type: "carousel",
      columns: [
        {
          title: "📤 指示書送付",
          text: "指示書を送ります",
          actions: [{ type: "message", label: "選 択", text: "指示書送付" }]
        },
        {
          title: "📂 指示書参照",
          text: "指示書を確認します",
          actions: [{ type: "message", label: "選 択", text: "指示書参照" }]
        }
      ]
    }
  };

  return client.replyMessage(replyToken, message);
}

async function sendEmployeeSelection(userId, replyToken, selectedCode = null) {
  const employees = await getEmployeeList();
  const selected = selectedCode || getSelectedEmployeeCode(userId);
  const carousel = createEmployeeCarousel(employees, 0, selected);
  return client.replyMessage(replyToken, carousel);
}

function sendCarousel(replyToken, carouselTemplate) {
  return client.replyMessage(replyToken, carouselTemplate);
}

function sendReportCarousel(userId, replyToken, reports, page = 0) {
  const columns = reports.map(r => {
    return {
      title: r.title.slice(0, 40),
      text: r.writeDate || '作成日不明',
      actions: [
        {
          type: 'message',
          label: '選択',
          text: `帳票:${r.reportName}`
        }
      ]
    };
  });

  const carousel = {
    type: 'template',
    altText: '帳票一覧です',
    template: {
      type: 'carousel',
      columns: columns.slice(page * 10, (page + 1) * 10)
    }
  };
  return client.replyMessage(replyToken, [carousel]);
}

// 📎 PDFのURLを送る専用関数
function replyWithLink(replyToken, url) {
  const shortUrl = storeShortLink(url);
  return client.replyMessage(replyToken, {
    type: 'text',
    text: `📎 帳票はこちらです：\n${shortUrl}`,
  });
}

module.exports = {
  sendText,
  replyWithLink,
  replyError,
  sendInstructionOptions,
  sendEmployeeSelection,
  sendCarousel,
  sendReportCarousel
};
