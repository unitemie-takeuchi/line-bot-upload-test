const logger = require('./logger');

function createEmployeeCarousel(employees, page = 0, selectedCode = null) {
  logger.debug(`[カルーセル] createEmployeeCarousel: 全社員数=${employees?.length}, page=${page}, selectedCode=${selectedCode}`);
  const selectedCodeStr = (selectedCode || '').toString().padStart(3, '0');
  const sortedEmployees = [...employees].sort((a, b) => {
    const codeA = a.code?.toString().padStart(3, '0') || '';
    const codeB = b.code?.toString().padStart(3, '0') || '';
    if (codeA === selectedCodeStr) return -1;
    if (codeB === selectedCodeStr) return 1;
    return codeA.localeCompare(codeB);
  });
  const start = page * 5;
  const limitedEmployees = sortedEmployees.slice(start, start + 5);
  logger.debug(`[カルーセル] 表示社員数=${limitedEmployees.length} (start=${start})`);
  const columns = limitedEmployees.map(emp => {
    const code = emp.code?.toString().trim() || '???';
    const name = emp.name?.toString().trim() || '（無名）';
    const label = `${code.padStart(3, '0')} ${name}`;

    return {
      title: label,
      text: "担当者を選択してください",
      actions: [
        {
          type: "message",
          label: "選 択",
          text: code
        }
      ]
    };
  });

  if (sortedEmployees.length > start + 5) {
    columns.push({
      title: "次のページ",
      text: "さらに表示します",
      actions: [{ type: "message", label: "次へ ▶", text: `次へ社員 ${page + 1}` }]
    });
  }

  return {
    type: "template",
    altText: "社員コードのリスト",
    template: { type: "carousel", columns }
  };
}

function createTitleCarousel(titles, page = 0) {
  const pageSize = 10;
  const start = page * pageSize;
  const pageData = titles.slice(start, start + pageSize);

  logger.debug(`[カルーセル] createTitleCarousel: タイトル件数=${titles?.length}, page=${page}, 表示数=${pageData.length}`);

  const columns = pageData.map(title => ({
    title: title.ReportName || '（無題）',
    text: `${title.WriteDate || title.WirteDate || '日付不明'}`,
    actions: [
      {
        type: 'message',
        label: '選択',
        text: `帳票 ${title.ReportName || '（無題）'}`
      }
    ]
  }));

  return {
    type: 'template',
    altText: '帳票名一覧です',
    template: {
      type: 'carousel',
      columns
    }
  };
}

function createMVEmployeeCarousel(employees, page = 0, selectedCode = null) {
  const selectedCodeStr = (selectedCode || '').toString().padStart(3, '0');

  // 並び替え
  const sortedEmployees = [...employees].sort((a, b) => {
    const codeA = a.code.toString().padStart(3, '0');
    const codeB = b.code.toString().padStart(3, '0');

    if (codeA === selectedCodeStr) return -1;
    if (codeB === selectedCodeStr) return 1;
    return codeA.localeCompare(codeB);
  });

  const start = page * 5;
  const limited = sortedEmployees.slice(start, start + 5);

  const columns = limited.map(emp => ({
    title: `${emp.code} ${emp.name}`,
    text: "担当者を選択してください",
    actions: [
      {
        type: "postback",
        label: "選 択",
        data: `mvEmpSelect:${emp.code}`
      }
    ]
  }));

  if (sortedEmployees.length > start + 5) {
    columns.push({
      title: "次のページ",
      text: "さらに表示します",
      actions: [
        {
          type: "postback",
          label: "次へ ▶",
          data: `mvEmpNext:${page + 1}`
        }
      ]
    });
  }

  return {
    carousel: {
      type: "template",
      altText: "担当者選択",
      template: {
        type: "carousel",
        columns
      }
    },
    sortedEmployees
  };
}


function createReportCarousel(reports, page = 0) {
  const pageSize = 10;
  const start = page * pageSize;
  const pageData = reports.slice(start, start + pageSize);

  const columns = pageData.map(rep => ({
    title: rep.ReportName || "（未設定）",
    text: "報告書の種類を選択してください",
    actions: [
      {
        type: "postback",
        label: "選択",
        data: `mvReport:${rep.ReportName}`
      }
    ]
  }));

  return {
    type: "template",
    altText: "報告書の種類一覧です",
    template: {
      type: "carousel",
      columns
    }
  };
}

/**
 * 帳票選択パネル（1枚だけにするよ！）
 */
function createListSelectCarousel() {
  const liffUrl = "https://liff.line.me/2007688662-pvBRmKxR";

  return {
    type: "template",
    altText: "データ抽出を開始します",
    template: {
      type: "buttons", // カルーセルじゃなくて「ボタン」形式
      title: "データ抽出・確認",
      text: "受注・売上・仕入を確認できます",
      actions: [
        { 
          type: "uri", 
          label: "データ抽出を開く", 
          // 最初は「受注(order)」で開くように設定しておく
          uri: `${liffUrl}?mode=order` 
        }
      ]
    }
  };
}

module.exports = {
  createEmployeeCarousel,
  createTitleCarousel,
  createReportCarousel,
  createMVEmployeeCarousel,
  createListSelectCarousel
};
