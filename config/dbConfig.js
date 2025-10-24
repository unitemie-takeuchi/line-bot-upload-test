require('dotenv').config();

module.exports = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  port: parseInt(process.env.SQL_PORT, 10),
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

