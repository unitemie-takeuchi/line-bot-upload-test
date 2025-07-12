// config/graphAuth.js
// Microsoft Graph API用 アクセストークン取得モジュール

const axios = require('axios');
const qs = require('querystring');

async function getAccessToken() {
  const data = {
    client_id: process.env.OAUTH_CLIENT_ID,
    client_secret: process.env.OAUTH_CLIENT_SECRET,
    scope: process.env.OAUTH_SCOPE,
    grant_type: 'client_credentials'
  };

  const response = await axios.post(process.env.OAUTH_TOKEN_URL, qs.stringify(data), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return response.data.access_token;
}

module.exports = { getAccessToken };
