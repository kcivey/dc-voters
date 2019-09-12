require('dotenv').config();
const mysql = require('mysql');
const NumberList = require('number-list');
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

db.getUser = function (criteria) {
    return queryPromise('SELECT * FROM users WHERE ? LIMIT 1', [criteria])
        .then(function (rows) {
            const user = rows[0] || null;
            if (!user) {
                return null;
            }
            return db.getProjectsForUser(user)
                .then(function (projects) {
                    user.projects = projects;
                    return user;
                });
        });
};

db.getUsersForProject = function (projectId) {
    const sql = 'SELECT u.*, COUNT(DISTINCT l.page) AS page_count,' +
        'GROUP_CONCAT(DISTINCT l.page ORDER BY l.page) AS pages ' +
        'FROM users u LEFT JOIN petition_lines l ON u.username = l.checker ' +
        'INNER JOIN project_users pu ON u.id = pu.user_id ' +
        'WHERE (l.project_id = ? OR l.project_id IS NULL) AND pu.project_id = ? ' +
        'GROUP BY u.id ORDER BY u.username';
    return queryPromise(sql, [projectId, projectId])
        .then(function (rows) {
            rows.forEach(function (row) {
                row.pages = row.pages ? NumberList.stringify(row.pages.split(',')) : '';
            });
            return rows;
        });
};

db.getProjectsForUser = function (user) {
    return queryPromise(
        'SELECT p.* FROM projects p INNER JOIN project_users pu ON p.id = pu.project_id WHERE pu.user_id = ?',
        [user.id]
    );
};

db.getProjectByCode = function (code) {
    return queryPromise('SELECT * FROM projects WHERE code = ?', [code])
        .then(rows => rows[0] || null);
};

db.searchForVoter = function ({q, voterId, name, address, limit}) {
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
            return {explanation, results};
        });
};

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

db.createOrUpdateUser = function (projectId, userData, id = null) {
    delete userData.project_id;
    delete userData.id;
    const values = [userData];
    let sql;
    if (id) {
        sql = 'UPDATE users SET ? WHERE id = ? AND project_id = ?';
        values.push(id, projectId);
    }
    else {
        sql = 'INSERT INTO users SET ?';
        userData.project_id = projectId;
    }
    return queryPromise(sql, values)
        .then(function (result) {
            if (result.insertId) {
                id = result.insertId;
            }
            if (!id) {
                throw new Error('No insert ID');
            }
            return queryPromise(
                'INSERT IGNORE INTO project_users SET ?',
                [{project_id: projectId, user_id: id}]
            );
        })
        .then(() => db.getUser({id}));
};

db.getChallengeRows = function (projectId, pages) {
    let sql = 'SELECT l.*, c.status as circulator_status, c.name as circulator_name, ' +
        'c.notes AS circulator_notes ' +
        'FROM petition_lines l LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ' +
        'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
        'WHERE l.project_id = ?';
    const values = [projectId];
    if (pages) {
        sql += ' AND l.page in (?)';
        values.push(NumberList.parse(pages));
    }
    sql += ' ORDER BY l.page, l.line';
    return queryPromise(sql, values);
};

db.getPage = function (projectId, pageNumber) {
    const sql = 'SELECT * FROM pages WHERE project_id = ? AND number = ?';
    return queryPromise(sql, [projectId, pageNumber])
        .then(rows => rows[0]);
};

db.getPages = function (projectId) {
    const sql = 'SELECT p.*, c.name AS circulator_name, ' +
        "SUM(IF(l.finding IN ('', 'S'), 0, 1)) AS processed_lines, " +
        'COUNT(l.id) AS total_lines, ' +
        'GROUP_CONCAT(DISTINCT l.checker ORDER BY l.checker) AS checker ' +
        'FROM pages p LEFT JOIN circulators c ON p.circulator_id = c.id ' +
        'INNER JOIN petition_lines l ON p.project_id = l.project_id AND p.number = l.page ' +
        'WHERE p.project_id = ? ' +
        'GROUP BY p.number ORDER BY p.number';
    return queryPromise(sql, [projectId]);
};

db.assignPages = function (projectId, username, pages) {
    return queryPromise(
        'UPDATE petition_lines SET checker = ? WHERE project_id = ? AND page IN (?)',
        [username, projectId, pages],
    );
};

db.createOrUpdatePage = async function ({projectId, data, number, id}) {
    const pageData = {...data}; // clone
    delete pageData.project_id;
    delete pageData.id;
    delete pageData.number;
    if (pageData.date_signed) {
        pageData.date_signed = pageData.date_signed
            .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
    }
    let numbers;
    let sql;
    const values = [pageData];
    if (id) {
        sql = 'UPDATE pages SET ? WHERE id = ? AND project_id = ? AND number = ?';
        values.push(id, projectId, number);
        numbers = [number];
    }
    else if (!pageData.number) {
        throw new Error('Missing page number');
    }
    else {
        if (!pageData.notes) {
            pageData.notes = ''; // can't set default in table for text column
        }
        pageData.project_id = projectId;
        sql = 'INSERT INTO pages (??) VALUES ?';
        const columnNames = Object.keys(pageData);
        numbers = NumberList.parse(data.number);
        const valuesForPageRecords = numbers.map(function (n) {
            pageData.number = n;
            return Object.values(pageData);
        });
        values.push(columnNames, valuesForPageRecords);
        number = numbers[0];
    }
    await queryPromise(sql, values);
    const linesPerPage = 20;
    const valuesForLineRecords = [];
    for (const n of numbers) {
        for (let line = 1; line <= linesPerPage; line++) {
            valuesForLineRecords.push([projectId, n, line]);
        }
    }
    await queryPromise(
        'INSERT IGNORE INTO petition_lines (project_id, page, line) VALUES ?',
        valuesForLineRecords
    );
    return queryPromise(
        'SELECT * FROM page WHERE project_id = ? AND number = ?',
        [projectId, number]
    )
        .then(rows => rows[0]);
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
