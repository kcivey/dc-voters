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
            ward AS \`Ward\`, res_frac, precinct AS \`Precinct\`, COUNT(*) AS \`Voters\`
        FROM ??
        where party = 'DEM' AND ward = 3
        GROUP BY res_street, res_house, res_frac, res_zip, ward, precinct
        HAVING \`Voters\` > ?
        ORDER BY \`Voters\` DESC, ward, res_zip, res_street, res_house, res_frac, precinct`,
        [votersTable, 100]
    );
    let headers = true;
    for (const row of await rows) {
        if (row.res_frac) {
            row.Number += '-' + row.res_frac;
        }
        delete row.res_frac;
        if (headers) {
            process.stdout.write(stringify([Object.keys(row)]));
            headers = false;
        }
        process.stdout.write(stringify([row]));
    }

}
