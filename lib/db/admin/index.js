/* db module with added admin functions that require more privileges on the database.
   Intended to be used in command-line programs, not web app. */
const fs = require('fs');
const generator = require('generate-password');
const db = require('..');
const {queryPromise} = db;

db.createDatabaseAndUser = async function (dbName, username, password) {
    if (!dbName) {
        dbName = 'dc_voters';
    }
    if (!username) {
        username = dbName;
    }
    if (!password) {
        password = generator.generate({length: 16, numbers: true, symbols: true});
    }
    await queryPromise('CREATE DATABASE ?? CHARACTER SET = ?', [dbName, 'utf8']);
    await queryPromise('CREATE USER ?@localhost IDENTIFIED BY ?', [username, password]);
    await queryPromise('GRANT DELETE, INSERT, SELECT, UPDATE ON ??.* TO ?@localhost', [dbName, username]);
    return {dbName, username, password};
};

db.createTables = async function () {
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

module.exports = db;
