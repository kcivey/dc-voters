#!/usr/bin/env node

var db = require('../db'),
    passwordHash = require('password-hash'),
    _ = require('underscore'),
    async = require('async'),
    argv = require('minimist')(process.argv.slice(2), {boolean: ['admin']}),
    table = 'users',
    username = argv._[0],
    password = argv._[1],
    admin = argv.admin,
    pageRange = argv.pages,
    email = argv.email || '',
    m, startPage, endPage, digits, todo;

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

function insertUser(callback) {
    db.query(
        'INSERT INTO ' + table + ' (username, password, admin, email) VALUES (?, ?, ?, ?)',
        [username, passwordHash.generate(password), admin ? 1 : 0, email],
        function (err, result) {
            if (err) {
                if (err.code == 'ER_DUP_ENTRY') {
                    console.log('User ' + username + ' already exists');
                }
                else {
                    return callback(err);
                }
            }
            else {
                console.log(result.affectedRows + ' user record created');
                console.log('Username ' + username + ', password ' + password);
            }
            callback(null, result);
        }
    );
}

function assignPages(callback) {
    db.query(
        "UPDATE petition_lines SET checker = ? WHERE finding = '' AND page BETWEEN ? AND ?",
        [username, startPage, endPage],
        function (err, result) {
            if (err) {
                return callback(err);
            }
            console.log(result.affectedRows + ' lines assigned');
            callback(null, result);
        }
    );
}

todo = [insertUser];
if (pageRange) {
    todo.push(assignPages);
}

async.series(todo, function (err, results) {
    if (err) {
        throw err;
    }
    process.exit();
});
