#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const csvParse = require('csv-parse');
const stringify = require('csv-stringify/lib/sync');
const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const infile = process.argv[2];
    assert(infile, 'Input file required');
    const parser = fs.createReadStream(infile)
        .pipe(csvParse({columns: true}));
    const projectId = (await db.getProjectByCode('i82')).id;
    let headers = true;
    for await (const r of parser) {
        if (headers) {
            process.stdout.write(stringify([Object.keys(r)]));
            headers = false;
        }
        const signed = await (
            db.queryPromise(
                `SELECT voter_id FROM petition_lines
                WHERE project_id = ?
                    AND voter_id = ?
                    AND finding = ?`,
                [projectId, r.new_voter_id, 'OK']
            ).then(rows => rows.length > 0)
        );
        if (!signed) {
            process.stdout.write(stringify([r]));
        }
    }
}
