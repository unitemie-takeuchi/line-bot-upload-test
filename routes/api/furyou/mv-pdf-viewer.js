//C:\Line-Bot-Upload\line-bot-upload-test\routes\api\furyou\mv-pdf-viewer.js
const express = require("express");
const axios = require("axios");
const qs = require("qs");

const router = express.Router();

// ★ .env から読む
const {
  OAUTH_TENANT_ID,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_SCOPE,
  OAUTH_TOKEN_URL,
  OAUTH_DRIVE_ID,
} = process.env;

// トークンを毎回取りに行く簡易版（まずはこれでOK）
async function getAccessToken() {
  const tokenUrl =
    OAUTH_TOKEN_URL ||
    `https://login.microsoftonline.com/${OAUTH_TENANT_ID}/oauth2/v2.0/token`;

  const body = {
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    scope: OAUTH_SCOPE || "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  };

  const res = await axios.post(tokenUrl, qs.stringify(body), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return res.data.access_token;
}

// GET /api/mv/pdf?file=ファイル名.pdf
router.get("/", async (req, res) => {
  const fileName = req.query.file;

  if (!fileName) {
    return res.status(400).send("file クエリが指定されていません。");
  }

  try {
    const accessToken = await getAccessToken();

    // ★ driveId のルート直下に PDF がある想定
    //   例）/Shared Documents/ の中がこのドライブの root なら、
    //       パスは /root:/005_0005-xxxx.pdf:/content でOK
    const encodedPath = encodeURIComponent(fileName);
    const graphUrl = `https://graph.microsoft.com/v1.0/drives/${OAUTH_DRIVE_ID}/root:/${encodedPath}:/content`;

    const graphRes = await axios.get(graphUrl, {
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // PDF としてそのままブラウザに返す
    res.setHeader("Content-Type", "application/pdf");
    // inline にしておけばブラウザ内表示になる
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(fileName)}"`
    );

    graphRes.data.pipe(res);
  } catch (err) {
    console.error("[MV-PDF-VIEWER ERROR]", err.response?.status, err.response?.data || err.message);
    if (err.response?.status === 404) {
      return res.status(404).send("PDF が見つかりませんでした。パス or ファイル名を確認してください。");
    }
    return res.status(500).send("PDF の取得中にエラーが発生しました。");
  }
});

module.exports = router;
