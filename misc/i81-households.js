#!/usr/bin/env node

const stringify = require('csv-stringify/lib/sync');
const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const tempTable = 'mailing_i81';

    /*
    await db.queryPromise(
        `CREATE TABLE ?? (
            voter_id INT UNSIGNED PRIMARY KEY,
            signer_name VARCHAR(255),
            signer_address VARCHAR(255),
            registered DATE,
            boe_name VARCHAR(255),
            boe_address VARCHAR(255),
            boe_zip CHAR(5),
            new_voter_id INT UNSIGNED
        )`,
        [tempTable]
    );
     */
    await db.queryPromise('DELETE FROM ??', [tempTable]);
    const oldVotersTable = 'voters_20200617';
    const newVotersTable = 'voters_20211117';
    const projectId = (await db.getProjectByCode('decrim-nature')).id;
    const circulatorIds = await (
        db.queryPromise(
            'SELECT id FROM circulators WHERE project_id = ? AND name IN (?)',
            [projectId, ['CC', 'CM', 'DM', 'ON']]
        ).then(rows => rows.map(r => r.id))
    );
    let query = db.queryPromise(
        `SELECT l.voter_name AS signer_name,
            l.address AS signer_address,
            l.voter_id,
            v2.registered,
            v2.firstname,
            v2.lastname,
            v2.middle,
            v2.suffix,
            v2.res_house,
            v2.res_frac,
            v2.res_street,
            v2.res_apt,
            v2.res_zip,
            v2.voter_id AS new_voter_id
        FROM petition_lines l INNER JOIN pages p ON l.project_id = p.project_id AND l.page = p.number
            INNER JOIN ?? v ON v.voter_id = l.voter_id
            INNER JOIN ?? v2
                ON v.registered = v2.registered AND
                    v.firstname = v2.firstname AND
                    v.lastname = v2.lastname AND
                    v.middle = v2.middle AND
                    v.suffix = v2.suffix
        WHERE finding = ? AND l.project_id = ? AND l.voter_id > 0 AND circulator_id IN (?)`,
        [oldVotersTable, newVotersTable, 'OK', projectId, circulatorIds]
    );
    for (const row of await query) {
        await db.queryPromise(
            'INSERT IGNORE INTO ?? VALUES(?)',
            [
                tempTable,
                [
                    row.voter_id,
                    row.signer_name,
                    row.signer_address,
                    row.registered,
                    makeName(row),
                    makeAddress(row),
                    row.res_zip,
                    row.new_voter_id,
                ],
            ]
        );
    }
    query = db.queryPromise(
        `SELECT GROUP_CONCAT(boe_name SEPARATOR '/') AS names, boe_address AS address, boe_zip AS zip
        FROM ??
        GROUP BY boe_address, boe_zip
        ORDER BY boe_address, boe_zip`,
        [tempTable]
    );
    let headers = true;
    for (const row of await query) {
        row.envelope_names = row.names
            .replace(/^([^/]+?) (?:[A-Z] )?([\w-]+)\/([^/]+?) (?:[A-Z] )?\2$/, '$1 & $3 $2')
            .replace(/^([^/]+?) (?:[A-Z] )?([\w-]+)\/([^/]+?) (?:[A-Z] )?([\w-]+)$/, '$1 $2 & $3 $4')
            .replace(/^.*\/.*$/, 'Initiative 81 Signers');
        if (headers) {
            process.stdout.write(stringify([Object.keys(row)]));
            headers = false;
        }
        process.stdout.write(stringify([row]));
    }

}

function makeName(v, reversed) {
    let name = v.firstname;
    if (v.middle) {
        name += ' ' + v.middle;
    }
    if (reversed) {
        name = v.lastname + ', ' + name;
    }
    else {
        name += ' ' + v.lastname;
    }
    if (v.suffix) {
        if (reversed) {
            name += ',';
        }
        name += ' ' + v.suffix;
    }
    return name;
}

function makeAddress(v) {
    let address = v.res_house + v.res_frac + ' ' + v.res_street;
    if (v.res_apt) {
        address += ' #' + v.res_apt;
    }
    return address;
}
