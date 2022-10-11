#!/usr/bin/env node

const assert = require('assert');
const stringify = require('csv-stringify/lib/sync');
const db = require('../lib/db');
const methodCodeToDescription = {
    Y: 'Voted at the polls',
    Z: 'Voted at the polls by special ballot (ballot was accepted)',
    N: 'Did not vote',
    A: 'Voted absentee (includes referred ballots that were accepted)',
    B: 'Absentee ballot not counted (rejected)',
    P: 'Special ballot rejected by Board',
    X: 'Ineligible to vote',
    E: 'Early voted',
    F: 'Early voted by special ballot (ballot was accepted)',
    '': 'No history',
};
const methodCodes = Object.keys(methodCodeToDescription);

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const votersTable = await db.getMostRecentVotersTable();
    const historyColumn = 'h110320g'; // 'h062122p';
    const rows = await db.queryPromise(
        `SELECT precinct, ?? AS method, COUNT(*) AS \`count\`
        FROM ??
        GROUP BY precinct, method
        ORDER BY precinct, method`,
        [historyColumn, votersTable]
    );
    const precinctData = {};
    for (const row of await rows) {
        const precinct = row.precinct;
        const method = row.method;
        assert(methodCodes.includes(method), `Unknown method "${method}" for precinct ${precinct}`);
        if (!precinctData[precinct]) {
            precinctData[precinct] = {};
        }
        precinctData[precinct][method] = row.count;
    }
    const newRows = [];
    for (const [precinct, p] of Object.entries(precinctData)) {
        const newRow = {precinct};
        for (const method of methodCodes) {
            newRow[method || 'No history'] = p[method] || '';
        }
        newRows.push(newRow);
    }
    let headers = true;
    for (const row of newRows) {
        if (headers) {
            process.stdout.write(stringify([Object.keys(row)]));
            headers = false;
        }
        process.stdout.write(stringify([row]));
    }
}
