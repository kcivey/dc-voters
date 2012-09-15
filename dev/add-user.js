var db = require('../db'),
    passwordHash = require('password-hash'),
    _ = require('underscore'),
    table = 'users',
    username = process.argv[2],
    password = process.argv[3],
    pageRange = process.argv[4],
    m, startPage, endPage, digits;

if (!username) {
    throw 'Missing username';
}
if (!/^\w+$/.test(username)) {
    throw 'Username must contain only letters, numbers, and underscores';
}
username = username.toLowerCase();

if (/^\d+-\d+$/.test(password)) {
    pageRange = password;
    password = null;
}

if (!password) {
    digits = _.range(10);
    password = _.range(4).map(function () {
        return _.range(10)[Math.floor(Math.random() * 10)].toString();
    }).join('');
}

if (pageRange && (m = pageRange.match(/^(\d+)-(\d+)$/))) {
    startPage = +m[1];
    endPage = +m[2];
}

db.query(
    'INSERT INTO ' + table + ' (username, password) VALUES (?, ?)',
    [username, passwordHash.generate(password)],
    function (err, result) {
        if (err) {
            if (err.code == 'ER_DUP_ENTRY') {
                console.log('User ' + username + ' already exists');
            }
            else {
                throw err;
            }
        }
        else {
            console.log(result.affectedRows + ' user record created');
            console.log('Username ' + username + ', password ' + password);
        }
        if (pageRange) {
            db.query(
                "UPDATE petition_lines SET checker = ? WHERE dcpt_code = '' AND page BETWEEN ? AND ?",
                [username, startPage, endPage],
                function (err, result) {
                    if (err) {
                        throw err;
                    }
                    console.log(result.affectedRows + ' lines assigned');
                    process.exit();
                }
            );
        }
        else {
            process.exit();
        }
    }
);
