var fs = require('fs'),
    path = require('path'),
    db = require('../db'),
    passwordHash = require('password-hash'),
    table = 'users',
    sql = fs.readFileSync(path.join(__dirname, 'create-table-' + table + '.sql'), 'utf-8');

db.query(sql, function (err, rows) {
    if (err) {
        throw err;
    }
    console.log('Created table ' + table);
    db.query(
        'INSERT INTO ' + table + ' (username, password) VALUES (?, ?)',
        ['public', passwordHash.generate('trust')],
        function (err, result) {
            if (err) {
                throw err;
            }
            console.log(result);
            process.exit();
        }
    );
});
