/* db module with added admin functions that require more privileges on the database,
   plus those that should only have to be done once for a project.
   Intended to be used in command-line programs, not web app. */
const fs = require('fs');
const generator = require('generate-password');
const db = require('..');
const loadVoterFile = require('./load-voter-file');
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

db.addProject = async function (properties) {
    if (!properties.name) {
        properties.name = properties.code;
    }
    properties.code = properties.code.toLowerCase()
        .replace(/[^a-z\d]+/g, '-')
        .replace(/^-|-$/g, '');
    if (!properties.code) {
        throw new Error('Invalid project code');
    }
    if (properties.findingCodes) {
        properties.findingCodes = JSON.stringify(properties.findingCodes, null, 2);
    }
    if (properties.circulatorStatuses) {
        properties.circulatorStatuses = JSON.stringify(properties.circulatorStatuses, null, 2);
    }
    await queryPromise(
        'INSERT INTO projects (??) VALUES (?)',
        [Object.keys(properties), Object.values(properties)]
    );
    return db.getProjectByCode(properties.code);
};

// Needs special database user
db.dropDatabaseAndUser = async function (database, user) {
    if (!database) {
        throw new Error('Missing database name');
    }
    await queryPromise('DROP DATABASE IF EXISTS ??', [database]);
    if (user) {
        try {
            await queryPromise('DROP USER ?@localhost', [user]);
        }
        catch (err) {
            // Ignore if user doesn't exist
        }
    }
};

// Before running this, remove backslashes from CSV file
db.loadVoterFile = loadVoterFile;

db.useDatabase = function (database) {
    return queryPromise('USE ??', [database]);
};

module.exports = db;
