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
db.loadVoterFile = async function (filename) {
    const tableName = 'voters_new';
    await queryPromise(`DROP TABLE IF EXISTS ${tableName}`);
    await queryPromise(`CREATE TABLE ${tableName} LIKE voters_base`);
    await queryPromise(
        `LOAD DATA LOCAL INFILE ? INTO TABLE ??
        FIELDS TERMINATED BY ? 
        OPTIONALLY ENCLOSED BY ?
        LINES TERMINATED BY ?
        IGNORE 1 LINES`,
        [filename, tableName, ',', '"', '\n']
    );
    await deleteDuplicateVoters();
    const maxRegistrationDate = await queryPromise(
        `SELECT MAX(v.registered) AS max_registered FROM
            (SELECT registered, COUNT(*) FROM ${tableName} GROUP BY registered HAVING COUNT(*) > 10) v`
    ).then(rows => rows[0].max_registered);
    const oldVotersTable = await db.getMostRecentVotersTable();
    if (oldVotersTable) {
        await syncVoterIds();
    }
    const votersTable = 'voters_' + maxRegistrationDate.replace(/-/g, '');
    await queryPromise('RENAME TABLE ?? TO ??', [tableName, votersTable]);
    return votersTable;

    function deleteDuplicateVoters() {
        const columns = [
            'lastname',
            'firstname',
            'middle',
            'suffix',
            'res_house',
            'res_frac',
            'res_street',
            'res_apt',
            'registered',
        ].join(', ');
        return queryPromise(
            `DELETE FROM ${tableName}
            WHERE voter_id IN (
                SELECT d.voter_id FROM (
                    SELECT MAX(voter_id) AS voter_id, ${columns}, COUNT(*)
                    FROM ${tableName}
                    GROUP BY ${columns}
                    HAVING COUNT(*) > 1
                ) d
            )`
        );
    }

    async function syncVoterIds() {
        // Get rid of primary key temporarily
        await queryPromise(
            `ALTER TABLE ${tableName}
            DROP PRIMARY KEY,
            MODIFY voter_id INT UNSIGNED NULL,
            ADD UNIQUE voter_id_unique (voter_id)`
        );
        await queryPromise(`UPDATE ${tableName} SET voter_id = NULL`);
        // add IDs from old file
        await queryPromise(
            `UPDATE ${tableName} v1
            SET voter_id = (
                SELECT MAX(voter_id) FROM ${oldVotersTable} v2
                WHERE v1.registered = v2.registered AND
                    v1.firstname = v2.firstname AND
                    v1.lastname = v2.lastname AND
                    v1.middle = v2.middle AND
                    v1.suffix = v2.suffix AND
                    v1.res_house = v2.res_house AND
                    v1.res_frac = v2.res_frac AND
                    v1.res_street = v2.res_street AND
                    v1.res_apt = v2.res_apt
            )
            WHERE voter_id IS NULL`
        );
        await queryPromise(
            `UPDATE IGNORE ${tableName} v1
            SET voter_id = (
                SELECT MAX(voter_id) FROM ${oldVotersTable} v2
                WHERE v1.registered = v2.registered AND
                    v1.firstname = v2.firstname AND
                    v1.lastname = v2.lastname AND
                    v1.middle = v2.middle AND
                    v1.suffix = v2.suffix
            )
            WHERE voter_id IS NULL`
        );
        // Fill in missing value and restore the primary key
        await queryPromise(`SET @id := (SELECT MAX(voter_id) FROM ${tableName})`);
        await queryPromise(`UPDATE ${tableName} SET voter_id = (@id := @id + 1) WHERE voter_id IS NULL`);
        await queryPromise(
            `ALTER TABLE ${tableName}
            DROP INDEX voter_id_unique,
            MODIFY voter_id INT UNSIGNED NOT NULL,
            ADD PRIMARY KEY (voter_id)`
        );
    }
};

db.useDatabase = function (database) {
    return queryPromise('USE ??', [database]);
};

module.exports = db;
