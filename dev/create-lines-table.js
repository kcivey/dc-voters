#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    db = require('../db'),
    table = 'petition_lines',
    sql = fs.readFileSync(path.join(__dirname, 'create-table-' + table + '.sql'), 'utf-8'),
    extraFields = JSON.parse(fs.readFileSync(path.join(path.dirname(__dirname), 'public', 'config.json'))).extraFields,
    extraSql = '';

_.each(extraFields, function (field, code) {
    extraSql += '\n  `' + code + '` ' +
        (field.type == 'boolean' ? 'TINYINT(1) UNSIGNED DEFAULT NULL' : "VARCHAR(255) DEFAULT '' NOT NULL") + ',';
});
sql = sql.replace(/(?=\n\s*PRIMARY KEY)/, extraSql);

db.query(sql, function (err, rows) {
    if (err) {
        throw err;
    }
    console.log('Created table ' + table);
    process.exit();
});
