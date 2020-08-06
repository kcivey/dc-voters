#!/usr/bin/env node

const marClient = require('dc-mar').createClient();
const db = require('../lib/db');
const projectCode = process.argv[2] || 'decrim-nature';

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const project = await db.getProjectByCode(projectCode);
    const rows = await db.queryPromise(
        `SELECT id, address
        FROM petition_lines
        WHERE project_id = ? AND finding IN (?) AND address <> ?`,
        [project.id, ['NR'], '']
    );
    const batchSize = 40;
    for (let start = 0; start < rows.length; start += batchSize) {
        const searchStrings = rows.slice(start, start + batchSize).map(row => row.address);
        const marAddressSets = await marClient.findLocationBatch(searchStrings);
        for (let i = 0; i < searchStrings.length; i++) {
            const marAddress = marAddressSets[i][0];
            if (marAddress && marAddress.confidenceLevel() > 94) {
                console.log(searchStrings[i], '=>', marAddress.fullAddress());
                await db.queryPromise(
                    `UPDATE petition_lines
                    SET ward = ?
                    WHERE id = ?`,
                    [marAddress.ward(), rows[start + i].id]
                );
            }
        }
    }
}
