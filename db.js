var config = require('./config'),
    mysql = require('mysql');
module.exports = mysql.createConnection(config.get('database'));
