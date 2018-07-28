#!/usr/bin/env node

var db = require('../db'),
    _ = require('underscore'),
    request = require('request'),
    async = require('async'),
    limit = +process.argv[2] || 100,
    table = 'petition_lines',
    sql = 'SELECT id, address FROM ' + table + " WHERE todo = 0 AND voter_id <> '' AND boe_validated = '' AND address <> '' AND std_address = '' " +
        ' ORDER BY id LIMIT ' + limit,
    stAbbr = {
        ALLEY: 'ALY',
        AVENUE: 'AVE',
        BOULEVARD: 'BLVD',
        CIRCLE: 'CIR',
        CRESCENT: 'CRES',
        COURT: 'CT',
        DRIVE: 'DR',
        GREEN: 'GRN',
        KEYS: 'KYS',
        LANE: 'LN',
        PARKWAY: 'PKY',
        PLACE: 'PL',
        ROAD: 'RD',
        STREET: 'ST',
        TERRACE: 'TER'
    };

db.query(sql, function (err, rows) {
    var addresses = {},
        queue = async.queue(getStdAddress, 2);
    if (err) {
        throw err;
    }
    queue.drain = function () {
        console.log('Finished');
        process.exit();
    };
    rows.forEach(function (row) {
        queue.push(row, function (err) {
            if (err) {
                console.log('Error for ' + row.id + ': ', err);
            }
        });
    });
});

function getStdAddress(obj, callback) {
    var id = obj.id,
        searchAddress = obj.address;
    console.log('Looking up ' + id + ': ' + searchAddress);
    request(
        {
            url: 'http://citizenatlas.dc.gov/newwebservices/locationverifier.asmx/findLocation',
            qs: {str: searchAddress}
        },
        function (err, response, body) {
            var m, address, sql;
            if (err) {
                return callback(err);
            }
            if ((m = body.match(/<FULLADDRESS>([^<>]+)<\/FULLADDRESS>/)) ||
                (m = body.match(/&lt;STRONG&gt;Normalized:&lt;\/STRONG&gt;\s*(.*?)\s*&lt;\/br&gt;/))) {
                address = m[1].replace(/\b(\w+)(?=(?: [NS][EW])?$)/, function (match) {
                    return stAbbr[match] || match;
                });
            }
            else {
                address = '[NOT FOUND]';
            }
            sql = 'UPDATE ' + table + ' SET std_address = ? WHERE id = ?';
            db.query(sql, [address, id], function (err, result) {
                if (err) {
                    return callback(err);
                }
                console.log('Updated ' + id + ': ' + address);
                return callback(null);
            });
        }
    );
}
