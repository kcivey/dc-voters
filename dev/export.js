var stringifier = require('csv-stringify')({header: true}),
    argv = require('minimist')(process.argv.slice(2)),
    db = require('../db'),
    sql = 'SELECT * FROM voters WHERE 1',
    values = [];

stringifier
    .on('readable', function () {
        var data;
        while(data = stringifier.read()) {
            process.stdout.write(data);
        }
    })
    .on('error', function (err){
        throw err;
    })
    .on('finish', function () {
        process.exit();
    });

if (argv.precinct) {
    sql += ' AND precinct = ?';
    values.push(+argv.precinct);
}
if (argv.party) {
    sql += ' AND party = ?';
    values.push(argv.party);
}
if (argv['with-apt']) {
    sql += " AND res_apt <> ''";
}

sql += ' ORDER BY lastname, firstname, middle';

db.query(sql, values, function (err, rows) {
    if (err) {
        throw err;
    }
    rows.forEach(function (row) {
        stringifier.write(row);
    });
    stringifier.end();
});
