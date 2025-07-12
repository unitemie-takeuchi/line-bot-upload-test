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

module.exports = {
  createEmployeeCarousel,
  createTitleCarousel
};
