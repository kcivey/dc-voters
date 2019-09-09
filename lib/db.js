require('dotenv').config();
const mysql = require('mysql');
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
