require('dotenv').config();
const mysql = require('mysql');
const async = require('async');
const {party} = require('../public/config');
const dbConfig = getDbConfig();
const db = mysql.createConnection(dbConfig);

db.connectionString = 'mysql://' + encodeURIComponent(dbConfig.user) + ':' +
    encodeURIComponent(dbConfig.password) + '@' + dbConfig.host +
    '/' + dbConfig.database + '?timezone=' + dbConfig.timezone;
if (dbConfig.dateStrings) {
    db.connectionString += 'dateStrings=true';
}

function queryPromise(sql, values = []) {
    return new Promise(function (resolve, reject) {
        db.query(sql, values, function (err, results) {
            if (err) {
                reject(err);
            }
            else {
                resolve(results);
            }
        });
    });
}

db.getUser = function getUser(criteria, done) {
    return queryPromise('SELECT * FROM users WHERE ?', [criteria])
        .then(function (rows) {
            const user = rows[0] || null;
            if (!user) {
                return done(null, null);
            }
            return db.getProjectsForUser(user, function (err, projects) {
                if (err) {
                    return done(err);
                }
                user.projects = projects;
                return done(null, user);
            });
        })
        .catch(done);
};

db.getProjectsForUser = function getProjectsForUser(user, done) {
    return queryPromise(
        'SELECT p.* FROM projects p INNER JOIN project_users pu ON p.id = pu.project_id WHERE pu.user_id = ?',
        [user.id]
    )
        .then(rows => done(null, rows))
        .catch(done);
};

db.getProjectByCode = function getProjectByCode(code, done) {
    return queryPromise('SELECT * FROM projects WHERE code = ?', [code])
        .then(function (rows) {
            const project = rows[0] || null;
            return done(null, project);
        })
        .catch(done);
};

db.searchForVoter = function ({q, voterId, name, address, limit}, done) {
    limit = Math.min(100, Math.max(0, Math.round(+limit))) || 10;
    let explanation = '';
    let match = '';
    if (q) {
        match = 'MATCH (v.firstname, v.lastname, v.res_house, v.res_street) AGAINST (? IN BOOLEAN MODE)';
        explanation += 'General query: ' + q + '\n';
    }
    let sql = 'SELECT v.registered, v.lastname, v.firstname, v.middle, v.suffix, v.status, v.res_house, ' +
        'v.res_frac, v.res_apt, v.res_street, v.ward, v.voter_id';
    const values = [];
    if (party) {
        sql += ', v.party';
    }
    if (match) {
        sql += ', ' + match + ' AS score';
        values.push(q);
    }
    sql += ' FROM voters v WHERE 1';
    if (name) {
        const m = /^([^,]*),\s*(.+)/.exec(name);
        if (m) {
            sql += ' AND v.firstname LIKE ?';
            values.push(m[2] + '%');
            name = m[1];
            explanation += 'First name: ' + m[2] + '*\n';
        }
        if (name) {
            name = name.replace(/\s*,\s*$/, '');
            sql += ' AND v.lastname LIKE ?';
            values.push(name + '%');
            explanation += 'Last name: ' + name + '*\n';
        }
    }
    if (address) {
        const m = /^(\d+)\s+(.+)/.exec(address);
        if (m) {
            sql += ' AND v.res_house = ?';
            values.push(m[1]);
            address = m[2];
            explanation += 'House number: ' + m[1] + '\n';
        }
        sql += ' AND v.res_street LIKE ?';
        values.push(address + '%');
        explanation += 'Street name: ' + address + '*\n';
    }
    if (voterId) {
        sql += ' AND v.voter_id = ?';
        values.push(voterId);
        explanation += 'Voter ID: ' + voterId + '\n';
    }
    if (match) {
        sql += ' AND ' + match + ' ORDER BY score DESC';
        values.push(q);
    }
    else {
        sql += ' ORDER BY v.lastname, v.firstname, v.middle, v.suffix';
    }
    sql += ' LIMIT ' + limit;
    return queryPromise(sql, values)
        .then(function (results) {
            explanation = results.length +
                (results.length < limit ? '' : ' or more') +
                ' record' + (results.length === 1 ? '' : 's') + '\n' +
                explanation;
            return done(null, {explanation, results});
        })
        .catch(done);
};

db.getStatus = function (projectId, username, done) {
    async.series(
        [
            function getNextLine(callback) {
                const sql = 'SELECT * FROM petition_lines WHERE project_id = ? AND checker = ? ' +
                    "AND finding = '' " +
                    'ORDER BY page, line LIMIT 1';
                return queryPromise(sql, [projectId, username])
                    .then(function (rows) {
                        return callback(null, {lineRecord: rows[0] || null});
                    })
                    .catch(callback);
            },
            function getUserProgress(callback) {
                const sql = "SELECT IF(finding IN ('', 'S'), 'incomplete', 'complete') AS state, " +
                    'COUNT(*) AS `count` FROM petition_lines ' +
                    'WHERE project_id = ? AND checker = ? GROUP BY state';
                return queryPromise(sql, [projectId, username])
                    .then(function (rows) {
                        const partialStatus = {};
                        rows.forEach(function (row) {
                            partialStatus[row.state] = +row.count;
                        });
                        return callback(null, partialStatus);
                    })
                    .catch(callback);
            },
        ],
        function (err, results) {
            if (err) {
                return done(err);
            }
            const status = Object.assign({}, ...results);
            return done(null, status);
        }
    );
};

db.getTotals = function (projectId, circulatorId, done) {
    async.series(
        [
            function getCountsByFinding(callback) {
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
                        return callback(null, totals);
                    })
                    .catch(callback);
            },
            function getWardRegistered(callback) {
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
                        return callback(null, wardRegistered);
                    })
                    .catch(callback);
            },
            function getWardSigners(callback) {
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
                        return callback(null, wardSigners);
                    })
                    .catch(callback);
            },
        ],
        function (err, results) {
            if (err) {
                return done(err);
            }
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
            return done(null, {totals, wardBreakdown});
        }
    );
};

db.createOrUpdateUser = function (projectId, userData, id, done) { // eslint-disable-line max-params
    const values = [userData];
    let sql;
    if (id) {
        delete userData.id;
        sql = 'UPDATE users SET ? WHERE id = ?';
        values.push(id);
    }
    else {
        sql = 'INSERT INTO users SET ?';
    }
    return queryPromise(sql, values)
        .then(function (result) {
            if (result.insertId) {
                id = result.insertId;
            }
            if (!id) {
                throw new Error('No insert ID');
            }
            return id;
        })
        .then(function (id) {
            return queryPromise(
                'INSERT IGNORE INTO project_users SET ?',
                [{project_id: projectId, user_id: id}]
            );
        })
        .then(() => db.getUser({id}, done))
        .catch(done);
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
