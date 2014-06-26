var fs = require('fs'),
    path = require('path'),
    db = require('../db'),
    table = 'petition_lines',
    sql = fs.readFileSync(path.join(__dirname, 'create-table-' + table + '.sql'), 'utf-8'),
    pages = 500,
    linesPerPage = 20;

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
