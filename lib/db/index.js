const findConfig = require('find-config');
const dotEnvResult = require('dotenv').config({path: findConfig('.env')});
const assert = require('assert');
const mysql = require('mysql2/promise');
const db = {makeSqlCriteria, queryPromise};
require('./circulators')(db);
require('./invoices')(db);
require('./lines')(db);
require('./notes')(db);
require('./pages')(db);
require('./projects')(db);
require('./users')(db);
require('./voters')(db);

if (dotEnvResult.error) {
    throw dotEnvResult.error;
}

db.establishPool = function (config = {}) {
    const defaults = getDbConfig();
    config = {...defaults, connectionLimit: 6, ...config};
    // config.debug = ['ComQueryPacket'];
    db.pool = mysql.createPool(config);
    // Connection string is used for passwordless plugin
    db.connectionString = 'mysql://' + encodeURIComponent(config.user) + ':' +
        encodeURIComponent(config.password) + '@' + config.host +
        '/' + config.database + '?timezone=' + config.timezone;
    if (config.dateStrings) {
        db.connectionString += '&dateStrings=true';
    }
};

db.getPool = function () {
    if (!db.pool) {
        db.establishPool();
    }
    return db.pool;
};

db.getConnectionString = function () {
    if (!db.pool) {
        db.establishPool();
    }
    return db.connectionString;
};

async function queryPromise(sql, values = []) {
    if (!db.pool) {
        db.establishPool();
    }
    return (await db.pool.query(sql, values))[0];
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

db.getStatus = function (project, username) {
    const isResponse = project.type === 'response';

    function getNextLine() {
        let sql = "SELECT * FROM petition_lines WHERE project_id = ? AND checker = ? AND finding = '' ";
        if (isResponse) {
            sql += 'AND challenged ';
        }
        sql += 'ORDER BY page, line LIMIT 1';
        return queryPromise(sql, [project.id, username])
            .then(rows => ({lineRecord: rows[0] || null}));
    }

    function getUserProgress() {
        let sql = "SELECT IF(finding IN ('', 'S'), 'incomplete', 'complete') AS state, " +
            'COUNT(*) AS `count` FROM petition_lines ' +
            'WHERE project_id = ? AND checker = ? ';
        if (isResponse) {
            sql += 'AND challenged ';
        }
        sql += 'GROUP BY state';
        return queryPromise(sql, [project.id, username])
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

db.getTotals = function (project, circulatorId = null) {

    function getCountsByFinding() {
        let sql =
            "SELECT (CASE WHEN (c.status = '' OR c.status IS NULL) THEN l.finding ELSE c.status END) " +
                'AS combinedFinding, ' +
            'COUNT(*) AS count FROM petition_lines l ' +
            'LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ' +
            'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
            'WHERE l.project_id = ? ';
        const values = [project.id];
        if (circulatorId) {
            sql += 'AND p.circulator_id = ? ';
            values.push(circulatorId);
        }
        if (project.type === 'response') {
            sql += 'AND l.challenged ';
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
            'SELECT ward, COUNT(*) as registered FROM ?? WHERE ward > 0 GROUP BY ward',
            project.votersTable
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
        const values = [project.id];
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

    function getAvgTime() {
        return queryPromise(
            `SELECT AVG(diff) AS avg_time FROM (${db.avgTimeSql}) t
            WHERE diff < ${db.avgTimeMax} AND finding <> 'B'`
        )
            .then(rows => (rows[0] ? rows[0].avg_time : null));
    }

    return Promise.all([getCountsByFinding(), getWardRegistered(), getWardSigners(), getAvgTime()])
        .then(function (results) {
            const [totals, registeredByWard, signersByWard, avgTime] = results;
            const wardBreakdown = {};
            for (const [key, count] of Object.entries(registeredByWard)) {
                const ward = key || 'Unknown';
                if (!wardBreakdown[ward]) {
                    wardBreakdown[ward] = {signers: 0};
                }
                wardBreakdown[ward].registered = count;
            }
            for (const [key, count] of Object.entries(signersByWard)) {
                const ward = key || 'Unknown';
                if (!wardBreakdown[ward]) {
                    wardBreakdown[ward] = {registered: 0};
                }
                wardBreakdown[ward].signers = count;
            }
            return {totals, wardBreakdown, avgTime};
        });
};

db.getMostRecentVotersTable = function () {
    return queryPromise("SHOW TABLES LIKE 'voters\\_%'")
        .then(function (rows) {
            return rows.map(r => Object.values(r)[0])
                .filter(t => /^voters_\d{8}$/.test(t))
                .pop();
        });
};

db.close = function () {
    return db.pool.end();
};

module.exports = db;

function getDbConfig() {
    const dbConfig = {
        host: 'localhost',
        database: 'dc_voters',
        dateStrings: true,
        timezone: 'Z',
        charset: 'utf8',
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
