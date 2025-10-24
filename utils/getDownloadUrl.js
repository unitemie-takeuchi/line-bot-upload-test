// utils/getDownloadUrl.js
const axios = require('axios');
const getAccessToken = require('../config/graphAuth');

async function getDownloadUrl(fileId) {
  try {
    const accessToken = await getAccessToken();

    const url = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const downloadUrl = response.data['@microsoft.graph.downloadUrl'];
    return downloadUrl;
  } catch (error) {
    console.error('[ERROR] getDownloadUrl:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = getDownloadUrl;
