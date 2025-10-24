// utils/buildViewerUrl.js

function buildViewerUrl(downloadUrl) {
  const base = 'https://unitemie.sakura.ne.jp/report-viewer.html';
  const encoded = encodeURIComponent(downloadUrl);
  return `${base}?url=${encoded}`;
}

module.exports = buildViewerUrl;
