#!/usr/bin/env node

var async = require('async'),
    db = require('../db'),
    sql = 'SELECT l1.page AS original_page, l1.line AS original_line, l1.finding AS original_finding, ' +
        'l2.page AS duplicate_page, l2.line AS duplicate_line, l2.finding AS duplicate_finding, l2.notes AS duplicate_notes ' +
        'FROM petition_lines l1 INNER JOIN petition_lines l2 ON l1.voter_id = l2.voter_id ' +
        "WHERE l1.voter_id <> '' AND l1.id < l2.id AND " +
        'l1.id = (SELECT MIN(l3.id) FROM petition_lines l3 WHERE l3.voter_id = l1.voter_id) ' +
        'ORDER BY l1.page, l1.line';

db.query(sql, function (err, rows) {
    var updates = [];
    if (err) {
        throw err;
    }
    rows.forEach(function (i, row) {
        var notes = row.duplicate_notes || '',
            finding = row.duplicate_finding,
            sql = 'UPDATE petition_lines SET finding = ?, notes = ? WHERE page = ? AND line = ?',
            values;
        if (notes) {
            notes += '; '
        }
        notes += 'Duplicate of page ' + row.original_page + ', line ' + row.original_line;
        if (finding === 'OK') {
            finding = 'D'
        }
        values = [finding, notes, row.duplicate_page, row.duplicate_line];
        updates.push(function (next) {
            db.query(sql, values, next);
        })
    });
    async.series(updates, function (err, results) {
        if (err) {
            throw err;
        }
        process.exit();
    });
});
