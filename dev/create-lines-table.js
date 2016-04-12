var fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    db = require('../db'),
    table = 'petition_lines',
    sql = fs.readFileSync(path.join(__dirname, 'create-table-' + table + '.sql'), 'utf-8'),
    extraFields = JSON.parse(fs.readFileSync(path.join(path.dirname(__dirname), 'public', 'config.json'))).extraFields,
    pages = 500,
    linesPerPage = 20,
    extraSql = '';

_.each(extraFields, function (field, code) {
    extraSql += '\n  `' + code + '` ' +
        (field.type == 'boolean' ? 'TINYINT(1) UNSIGNED DEFAULT NULL' : "VARCHAR(255) DEFAULT '' NOT NULL") + ',';
});
sql = sql.replace(/(?=\n\s*PRIMARY KEY)/, extraSql);

db.query(sql, function (err, rows) {
    var values = [],
        i, j;
    if (err) {
        throw err;
    }
    console.log('Created table ' + table);
    sql = 'INSERT INTO ' + table + ' (page,line) VALUES ';
    for (i = 1; i <= pages; i++) {
        for (j = 1; j <= linesPerPage; j++) {
            sql += (values.length ? ', ' : '') + '(?, ?)';
            values.push(i, j);
        }
    }
    db.query(sql, values, function (err, result) {
        if (err) {
            throw err;
        }
        console.log(result.message);
        process.exit();
    });
});
