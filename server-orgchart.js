require('dotenv').config();
const express = require('express');
const app = express();

const PORT = process.env.ORGCHART_PORT || 3100;

app.use('/orgchart', express.static('public/orgchart'));

app.listen(PORT, () => {
  console.log(`🚀 OrgChart server is running on port ${PORT}`);
});
