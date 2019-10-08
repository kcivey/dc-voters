/* db module with added admin functions that require more privileges on the database,
   plus those that should only have to be done once for a project.
   Intended to be used in command-line programs, not web app. */
const fs = require('fs');
const generator = require('generate-password');
const db = require('..');
const {queryPromise} = db;

// Needs special database user
db.createDatabaseAndUser = async function (database, user, password) {
    if (!database) {
        database = 'dc_voters';
    }
    if (!user) {
        user = database;
    }
    if (!password) {
        password = generator.generate({length: 16, numbers: true, symbols: true, exclude: "'"});
    }
    await queryPromise('CREATE DATABASE ?? CHARACTER SET = ?', [database, 'utf8']);
    await queryPromise('CREATE USER ?@localhost IDENTIFIED BY ?', [user, password]);
    await queryPromise('GRANT DELETE, INSERT, SELECT, UPDATE ON ??.* TO ?@localhost', [database, user]);
    return {database, user, password};
};

// Needs special database user
db.createTables = async function (database) {
    await queryPromise(`USE ${database}`);
    const createTablesFile = __dirname + '/create-tables.sql';
    const statements = fs.readFileSync(createTablesFile, 'utf8')
        .trim()
        .split(/;\n\s*/);
    for (const statement of statements) {
        await queryPromise(statement);
    }
};

db.createProject = async function ({code, name, config}) {
    if (!name) {
        name = code;
    }
    code = code.toLowerCase()
        .replace(/[^a-z]+/g, '_')
        .replace(/^_|_$/g, '');
    if (!code) {
        throw new Error('Invalid project code');
    }
    await queryPromise(
        'INSERT INTO projects ?',
        {
            code,
            name,
            config: config ? JSON.stringify(config, null, 2) : null,
        }
    );
    return db.getProjectByCode(code);
};

// Before running this, remove backslashes from CSV file
db.loadVoterFile = async function (database, filename) {
    await queryPromise(`USE ${database}`);
    await queryPromise('TRUNCATE voters');
    return queryPromise(
        `LOAD DATA LOCAL INFILE ? INTO TABLE voters
        FIELDS TERMINATED BY ? 
        OPTIONALLY ENCLOSED BY ?
        LINES TERMINATED BY ?
        IGNORE 1 LINES`,
        [filename, ',', '"', '\n']
    );
};

module.exports = db;
