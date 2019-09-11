require('dotenv').config();
const mysql = require('mysql');
const {party} = require('../public/config');
const dbConfig = getDbConfig();
const db = mysql.createConnection(dbConfig);

db.connectionString = 'mysql://' + encodeURIComponent(dbConfig.user) + ':' +
    encodeURIComponent(dbConfig.password) + '@' + dbConfig.host +
    '/' + dbConfig.database + '?timezone=' + dbConfig.timezone;
if (dbConfig.dateStrings) {
    db.connectionString += 'dateStrings=true';
}

db.getUser = function getUser(criteria, done) {
    db.query(
        'SELECT * FROM users WHERE ?',
        [criteria],
        function (err, rows) {
            console.log('db result', err, rows);
            if (err) {
                return done(err);
            }
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
        }
    );
};

db.getProjectsForUser = function getProjectsForUser(user, done) {
    db.query(
        'SELECT p.* FROM projects p INNER JOIN project_users pu ON p.id = pu.project_id WHERE pu.user_id = ?',
        [user.id],
        function (err, rows) {
            console.log('db result', err, rows);
            if (err) {
                return done(err);
            }
            return done(null, rows);
        }
    );
};

db.getProjectByCode = function getProjectByCode(code, done) {
    db.query(
        'SELECT * FROM projects WHERE code = ?',
        [code],
        function (err, rows) {
            if (err) {
                console.log(err);
                return done(err);
            }
            const project = rows[0] || null;
            return done(null, project);
        }
    );
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
    db.query(sql, values, function (err, results) {
        if (err) {
            console.error(err);
            return done(err);
        }
        explanation = results.length +
            (results.length < limit ? '' : ' or more') +
            ' record' + (results.length === 1 ? '' : 's') + '\n' +
            explanation;
        return done(null, {explanation, results});
    });
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
