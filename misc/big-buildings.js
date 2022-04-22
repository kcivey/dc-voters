#!/usr/bin/env node

const stringify = require('csv-stringify/lib/sync');
const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const votersTable = 'voters_20220321';
    const rows = await db.queryPromise(
        `SELECT res_street AS \`Street\`, res_house AS \`Number\`, res_zip AS \`Zip\`,
            ward AS \`Ward\`, count(*) AS \`Voters\`
        FROM ??
        GROUP BY res_street, res_house, res_zip, ward
        HAVING \`Voters\` > ?
        ORDER BY \`Voters\` DESC, ward, res_zip, res_street, res_house`,
        [votersTable, 100]
    );
    let headers = true;
    for (const row of await rows) {
        if (row['Number Suffix']) {
            console.warn(row);
        }
        if (headers) {
            process.stdout.write(stringify([Object.keys(row)]));
            headers = false;
        }
        process.stdout.write(stringify([row]));
    }

}
