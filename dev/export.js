#!/usr/bin/env node

const stringify = require('csv-stringify/lib/sync');
const argv = require('yargs')
    .options({
        'anc': {
            type: 'string',
            describe: 'get voters in specified ANC (if 2 characters) or SMD',
            requiredArg: true,
        },
        'party': {
            type: 'string',
            describe: 'get voters in specified party',
            requiredArg: true,
        },
        'precinct': {
            type: 'string',
            describe: 'get voters in specified precinct',
            requiredArg: true,
        },
        'voters-table': {
            type: 'string',
            describe: 'name of voters table (defaults to most recent)',
            requiredArg: true,
        },
        'ward': {
            type: 'number',
            describe: 'get voters in specified ward',
            requiredArg: true,
        },
        'with-apt': {
            type: 'boolean',
            describe: 'get voters with apartment numbers',
        },
    })
    .strict(true)
    .argv;
const db = require('../lib/db');

getVoters()
    .catch(console.trace)
    .finally(() => db.close());

async function getVoters() {
    const criteria = getCriteria();
    const votersTable = await getVotersTable();
    const limit = 10000;
    let offset = 0;
    while (true) {
        const voterRecords = await db.getVoters({criteria, offset, limit, votersTable});
        const csv = stringify(voterRecords, {headers: true});
        process.stdout.write(csv);
        if (voterRecords.length < limit) {
            break;
        }
        offset += limit;
    }
}

function getCriteria() {
    const criteria = {};
    for (const column of ['precinct', 'party', 'ward']) {
        if (argv.hasOwnProperty(column)) {
            criteria[column] = argv[column];
        }
    }
    if (argv['with-apt']) {
        criteria.res_apt = ['<>', ''];
    }
    if (argv.anc) {
        const column = argv.anc.length === 2 ? 'anc' : 'smd';
        criteria[column] = argv.anc;
    }
    return criteria;
}

async function getVotersTable() {
    let votersTable = argv['voters-table'];
    if (!votersTable) {
        votersTable = await db.getMostRecentVotersTable();
    }
    return votersTable;
}
