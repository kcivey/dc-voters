const findConfig = require('find-config');
const dotEnvResult = require('dotenv').config({path: findConfig('.env')});
const assert = require('assert');
const mysql = require('mysql');
const dbConfig = getDbConfig();
const db = {
    connection: mysql.createConnection(dbConfig),
    makeSqlCriteria,
    queryPromise,
};
require('./circulators')(db);
require('./lines')(db);
require('./pages')(db);
require('./projects')(db);
require('./users')(db);
require('./voters')(db);

if (dotEnvResult.error) {
    throw dotEnvResult.error;
}

db.connectionString = 'mysql://' + encodeURIComponent(dbConfig.user) + ':' +
    encodeURIComponent(dbConfig.password) + '@' + dbConfig.host +
    '/' + dbConfig.database + '?timezone=' + dbConfig.timezone;
if (dbConfig.dateStrings) {
    db.connectionString += '&dateStrings=true';
}

function queryPromise(sql, values = []) {
    return new Promise(function (resolve, reject) {
        db.connection.query(sql, values, function (err, results) {
            if (err) {
                reject(err);
            }
            else {
                resolve(results);
            }
        });
    });
}

function makeSqlCriteria(criteria) {
    const sqlFragments = [];
    const values = [];
    for (let [column, value] of Object.entries(criteria)) {
        let op = '=';
        if (Array.isArray(value)) {
            assert.strictEqual(value.length, 2, '[operator, value] array must have exactly 2 elements');
            assert(
                ['=', '<>', '<', '>', '<=', '>=', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE'].includes(op),
                `Invalid operator "${op}"`
            );
            [op, value] = value;
        }
        if (value == null) {
            sqlFragments.push('?? IS NULL');
            values.push(column);
        }
        else {
            sqlFragments.push(`?? ${op} ?`);
            values.push(column, value);
        }
    }
    const sql = sqlFragments.join(' AND ');
    return [sql, values];
}

db.getStatus = function (projectId, username) {

    function getNextLine() {
        const sql = 'SELECT * FROM petition_lines WHERE project_id = ? AND checker = ? ' +
            "AND finding = '' " +
            'ORDER BY page, line LIMIT 1';
        return queryPromise(sql, [projectId, username])
            .then(rows => ({lineRecord: rows[0] || null}));
    }

    function getUserProgress() {
        const sql = "SELECT IF(finding IN ('', 'S'), 'incomplete', 'complete') AS state, " +
            'COUNT(*) AS `count` FROM petition_lines ' +
            'WHERE project_id = ? AND checker = ? GROUP BY state';
        return queryPromise(sql, [projectId, username])
            .then(function (rows) {
                const partialStatus = {};
                rows.forEach(function (row) {
                    partialStatus[row.state] = +row.count;
                });
                return partialStatus;
            });
    }

    return Promise.all([getNextLine(), getUserProgress()])
        .then(results => Object.assign({}, ...results));
};

db.getTotals = function (projectId, circulatorId = null) {

    function getCountsByFinding() {
        let sql = "SELECT (CASE WHEN c.status = '' THEN l.finding ELSE c.status END) AS combinedFinding, " +
            'COUNT(*) AS count FROM petition_lines l ' +
            'LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ' +
            'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
            'WHERE l.project_id = ? ';
        const values = [projectId];
        if (circulatorId) {
            sql += 'AND p.circulator_id = ? ';
            values.push(circulatorId);
        }
        sql += 'GROUP BY combinedFinding';
        return queryPromise(sql, values)
            .then(function (rows) {
                const totals = {};
                rows.forEach(function (row) {
                    totals[row.combinedFinding] = +row.count;
                });
                return totals;
            });
    }

    function getWardRegistered() {
        return queryPromise(
            // WHERE is because of bad data in BOE database (2 records with no ward)
            'SELECT ward, COUNT(*) as registered FROM voters WHERE ward > 0 GROUP BY ward'
        )
            .then(function (rows) {
                const wardRegistered = {TOTAL: 0};
                rows.forEach(function (row) {
                    wardRegistered[row.ward] = row.registered;
                    wardRegistered.TOTAL += row.registered;
                });
                return wardRegistered;
            });
    }

    function getWardSigners() {
        let sql = 'SELECT l.ward, COUNT(*) AS count FROM petition_lines l ';
        if (circulatorId) {
            sql += 'INNER JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ';
        }
        sql += "WHERE l.finding = 'OK' AND l.project_id = ? ";
        const values = [projectId];
        if (circulatorId) {
            sql += 'AND p.circulator_id = ? ';
            values.push(circulatorId);
        }
        sql += 'GROUP BY l.ward';
        return queryPromise(sql, values)
            .then(function (rows) {
                const wardSigners = {TOTAL: 0};
                rows.forEach(function (row) {
                    wardSigners[row.ward] = row.count;
                    wardSigners.TOTAL += row.count;
                });
                return wardSigners;
            });
    }

    return Promise.all([getCountsByFinding(), getWardRegistered(), getWardSigners()])
        .then(function (results) {
            const totals = results[0];
            const wardBreakdown = {};
            for (const [key, count] of Object.entries(results[1])) {
                const ward = key || 'Unknown';
                if (!wardBreakdown[ward]) {
                    wardBreakdown[ward] = {};
                }
                wardBreakdown[ward].registered = count;
            }
            for (const [key, count] of Object.entries(results[2])) {
                const ward = key || 'Unknown';
                if (!wardBreakdown[ward]) {
                    wardBreakdown[ward] = {registered: 0};
                }
                wardBreakdown[ward].signers = count;
            }
            return {totals, wardBreakdown};
        });
};

db.close = function () {
    return db.connection.end();
};

module.exports = db;

function getDbConfig() {
    const dbConfig = {
        host: 'localhost',
        database: 'dc_voters',
        dateStrings: true,
        timezone: 'Z',
    };
    const dbEnvMapping = {
        NAME: 'database',
        HOST: 'host',
        USER: 'user',
        PASSWORD: 'password',
    };
    for (const [envName, configName] of Object.entries(dbEnvMapping)) {
        let value = process.env['DATABASE_' + envName];
        if (value === 'true') {
            value = true;
        }
        else if (value === 'false') {
            value = false;
        }
        else if (/^\d+$/.test(value)) {
            value = +value;
        }
        if (value !== undefined) {
            dbConfig[configName] = value;
        }
    }
    return dbConfig;
}
