#!/usr/bin/env node

const db = require('../lib/db');
const sampleSize = 10;

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const votersTable = await db.getMostRecentVotersTable();
    await markSigners(votersTable);
}

async function markSigners(votersTable) {
    await db.queryPromise('UPDATE ?? SET i71_signer = NULL', votersTable);
    let result = await db.queryPromise(
        `UPDATE ?? v
        SET v.i71_signer = 1
        WHERE (
            SELECT COUNT(*) FROM i71 i
            WHERE v.firstname = i.first_name
                AND v.lastname = i.last_name
                AND i.normalized_address = v.address
        ) > 0`,
        votersTable
    );
    console.warn(result.affectedRows, 'marked as signers (matching name and address)');
    result = await db.queryPromise(
        `UPDATE ?? v
        SET v.i71_signer = 2
        WHERE i71_signer IS NULL
            AND name_count = 1
            AND (
                SELECT COUNT(*) FROM i71 i
                WHERE v.firstname = i.first_name
                    AND v.lastname = i.last_name
            ) > 0`,
        votersTable
    );
    console.warn(result.affectedRows, 'marked as signers (unique name at different address)');
}
