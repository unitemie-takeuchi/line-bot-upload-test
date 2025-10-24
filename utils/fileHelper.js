// utils/fileHelper.js
// ファイル名整形ユーティリティ（VBAと同等仕様）

/**
 * ファイル名を整形（半角化・スペース除去・13文字制限）
 * @param {string} baseName 入力されたファイル名
 * @returns {string} 整形済みファイル名
 */
function sanitizeFileName(baseName) {
  const halfWidth = baseName.normalize('NFKC');       // 半角変換相当
  const noSpaces = halfWidth.replace(/\s+/g, '');     // スペース削除
  return noSpaces.substring(0, 13);                   // 13文字制限
}

module.exports = {
  sanitizeFileName
};
