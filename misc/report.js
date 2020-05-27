#!/usr/bin/env node

const stringify = require('csv-stringify/lib/sync');
const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    await getData();
    await getData('signer', 1);
    await getData('signer', 0);
    await getData('supervoter', 1);
    await getData('supervoter', 0);
    await getData('segment', 'A');
    await getData('segment', 'B');
}

function getMailingCounts(column, value) {
    const exp = column === 'signer'
        ? 'IF(i71_signer, 1, 0)'
        : column === 'dummy'
            ? "''"
            : column;
    return db.queryPromise(
        `SELECT ward, COUNT(*) AS mailed
        FROM sample
        WHERE ${exp} = ?
        GROUP BY ward`,
        [value]
    );
}

async function getData(column = 'dummy', value = '') {
    const dataByWard = {};
    let rows = await getMailingCounts(column, value);
    for (const r of rows) {
        dataByWard[r.ward] = r;
    }
    const subqueryColumns = 'firstname lastname res_house res_frac res_street res_apt party ward'.split(/\s+/)
        .map(s => 'v.' + s);
    const exp = column === 'signer'
        ? 'IF(i71_signer, 1, 0)'
        : column === 'dummy'
            ? "''"
            : column;
    subqueryColumns.push(
        `(
            SELECT MAX(${exp})
            FROM sample s
            WHERE s.res_house = v.res_house AND
                s.res_frac = v.res_frac AND
                s.res_street = v.res_street AND 
                s.res_apt = v.res_apt
        ) AS ??`
    );
    const votersTable = await db.getMostRecentVotersTable();
    rows = await db.queryPromise(
        `SELECT ward,
            COUNT(*) AS signers,
            COUNT(DISTINCT r.res_house, r.res_frac, r.res_street, r.res_apt) AS addresses
        FROM (
            SELECT ${subqueryColumns.join(', ')}
            FROM ?? v INNER JOIN petition_lines l ON l.voter_id = v.voter_id
                INNER JOIN pages p ON l.page = p.number
                INNER JOIN circulators c ON p.circulator_id = c.id
            WHERE l.project_id = 5 AND l.finding = 'OK' AND c.name = 'DM'
        ) r
        WHERE ?? = ?
        GROUP by ward`,
        [column, votersTable, column, value]
    );
    dataByWard['TOTAL'] = {ward: 'TOTAL', mailed: 0, signers: 0, addresses: 0};
    for (const r of rows) {
        Object.assign(dataByWard[r.ward], r);
        for (const key of ['mailed', 'signers', 'addresses']) {
            dataByWard['TOTAL'][key] += dataByWard[r.ward][key];
        }
    }
    const data = Object.values(dataByWard);
    for (const r of data) {
        r.percent = 100 * (r.addresses || 0) / r.mailed;
    }
    process.stdout.write((column === 'dummy' ? 'OVERALL' : column + ': ' + value) + '\n');
    process.stdout.write(stringify(data, {header: true, delimiter: '\t'}));
    process.stdout.write('\n');
    return data;
}
