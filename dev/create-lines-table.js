var fs = require('fs'),
    path = require('path'),
    db = require('../db'),
    table = 'petition_lines',
    sql = fs.readFileSync(path.join(__dirname, 'create-table-' + table + '.sql'), 'utf-8'),
    pages = 1844,
    linesPerPage = 20;

db.query(sql, function (err, rows) {
    var pendingInserts = 0,
        inserted = 0,
        i, j;
    if (err) {
        throw err;
    }
    console.log('Created table ' + table);
    for (i = 1; i <= pages; i++) {
        for (j = 1; j <= linesPerPage; j++) {
            pendingInserts++;
            db.query(
                'INSERT INTO ' + table + '(page, line) VALUES (?, ?)',
                [i, j],
                function (err, rows) {
                    if (err) {
                        throw err;
                    }
                    inserted++;
                    if (!--pendingInserts) {
                        console.log(inserted + ' rows inserted');
                        process.exit();
                    }
                }
            );
        }
    }
});

