var config = require('./config'),
    mysql = require('mysql'),
    dbConfig = config.get('database');

module.exports = mysql.createConnection(dbConfig);
module.exports.connectionString = 'mysql://' + encodeURIComponent(dbConfig.user) + ':' +
    encodeURIComponent(dbConfig.password) + '@' + dbConfig.host +
    '/' + dbConfig.database + '?timezone=' + dbConfig.timezone;
if (dbConfig.dateStrings) {
    module.exports.connectionString += 'dateStrings=true';
}
