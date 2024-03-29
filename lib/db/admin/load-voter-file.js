const assert = require('assert');
const fs = require('fs');
const csvParse = require('csv-parse');
const db = require('..');
const {queryPromise} = db;

async function loadVoterFile(filename) {
    const tableName = 'voters_new';
    await queryPromise(`DROP TABLE IF EXISTS ${tableName}`);
    const parser = fs.createReadStream(filename)
        .pipe(csvParse({columns: headers => headers.map(columnNameFromHeader)}));
    let created = false;
    let batch = [];
    for await (const r of parser) {
        if (!created) {
            await createTable(Object.keys(r));
            created = true;
        }
        if (batch.length >= 1000) {
            await queryPromise(`INSERT INTO ${tableName} VALUES ?`, [batch]);
            batch = [];
        }
        // Handle missing precincts and wards
        for (const key of ['precinct', 'ward']) {
            if (!r[key]) {
                r[key] = 0;
            }
        }
        batch.push([...Object.values(r), null]);
    }
    if (batch.length) {
        await queryPromise(`INSERT INTO ${tableName} VALUES ?`, [batch]);
    }
    await deleteDuplicateVoters();
    const maxRegistrationDate = await queryPromise(
        `SELECT MAX(registered) AS max_registered FROM ${tableName} WHERE registered <= ?`,
        [
            (new Date()).toISOString()
                .slice(0, 10),
        ]
    ).then(rows => rows[0].max_registered);
    const oldVotersTable = await db.getMostRecentVotersTable();
    if (oldVotersTable) {
        await syncVoterIds();
    }
    const votersTable = 'voters_' + maxRegistrationDate.replace(/-/g, '');
    await queryPromise('RENAME TABLE ?? TO ??', [tableName, votersTable]);
    return votersTable;

    async function createTable(columns) {
        const historyColumns = columns.filter(name => /^h\d/.test(name));
        const createTableSql = (await queryPromise('SHOW CREATE TABLE voters_base'))[0]['Create Table']
            .replace(
                /(?:,\n\s+`h\d{6}[pgs]`[^\n,]+)+/,
                historyColumns.map(name => `,\n  \`${name}\` CHAR(1) NOT NULL DEFAULT ''`).join('')
            )
            .replace('voters_base', tableName);
        const createColumns = createTableSql.match(/(?<=\n {2}`)\w+(?=` )/g);
        assert.strictEqual(createColumns.length, columns.length + 1);
        for (let i = 0; i < columns.length; i++) {
            assert.strictEqual(createColumns[i], columns[i], 'Unexpected columns');
        }
        return queryPromise(createTableSql);
    }

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
            WHERE voter_id NOT IN (
                SELECT d.voter_id FROM (
                    SELECT MAX(voter_id) AS voter_id, ${columns}, COUNT(*)
                    FROM ${tableName}
                    GROUP BY ${columns}
                ) d
            )`
        );
    }

    function columnNameFromHeader(h) {
        return h.toLowerCase()
            .replace(/^v?(?=\d)/, 'h')
            .replace(' ', '_')
            .replace('-', '');
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
            `CREATE TEMPORARY TABLE voter_ids
            SELECT MAX(voter_id) AS voter_id,
                registered,
                firstname,
                lastname,
                middle,
                suffix,
                res_house,
                res_street
            FROM ${oldVotersTable}
            GROUP BY 2, 3, 4, 5, 6, 7, 8`
        );
        await queryPromise('ALTER TABLE voter_ids ADD INDEX (lastname, firstname)');
        await queryPromise(
            `UPDATE IGNORE ${tableName} v1
            SET voter_id = (
                SELECT voter_id FROM voter_ids v2
                WHERE v1.registered = v2.registered AND
                    v1.firstname = v2.firstname AND
                    v1.lastname = v2.lastname AND
                    v1.middle = v2.middle AND
                    v1.suffix = v2.suffix AND
                    v1.res_house = v2.res_house AND
                    v1.res_street = v2.res_street
            )
            WHERE voter_id IS NULL`
        );
        await queryPromise('DROP TABLE voter_ids');
        await queryPromise(
            `CREATE TEMPORARY TABLE voter_ids
            SELECT MAX(voter_id) AS voter_id,
                registered,
                firstname,
                lastname,
                middle,
                suffix
            FROM ${oldVotersTable}
            GROUP BY 2, 3, 4, 5, 6`
        );
        await queryPromise('ALTER TABLE voter_ids ADD INDEX (lastname, firstname)');
        await queryPromise(
            `UPDATE IGNORE ${tableName} v1
            SET voter_id = (
                SELECT voter_id FROM voter_ids v2
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
}

module.exports = loadVoterFile;
