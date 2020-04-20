#!/usr/bin/env node

const db = require('../lib/db');
const sampleSize = 10000;

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const votersTable = await db.getMostRecentVotersTable();
    await markSigners(votersTable);
    await clearSamples(votersTable);
    const supervoterCriterion = "h110618g IN ('A','V','Y') AND h110816g IN ('A','V','Y') AND h110414g IN ('A','V','Y')";
    await markRandom(votersTable, '', 1);
    await markRandom(votersTable, supervoterCriterion, 2);
    await markRandom(votersTable, 'i71_signer > 0', 3);
    await markRandom(
        votersTable,
        `i71_signer > 0 AND ${supervoterCriterion}`,
        4
    );
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

function clearSamples(votersTable) {
    return db.queryPromise('UPDATE ?? SET sample = NULL', votersTable);
}

async function markRandom(votersTable, criteria, sampleNumber) {
    const where = 'WHERE sample IS NULL' + (criteria ? ' AND ' + criteria : '');
    const wardSampleSize = Math.ceil(sampleSize / 8);
    for (let ward = 1; ward <= 8; ward++) {
        await db.queryPromise(
            `CREATE TEMPORARY TABLE ids
            SELECT voter_id
            FROM ??
            ${where} AND ward = ?
            ORDER BY RAND()
            LIMIT ?`,
            [votersTable, ward, wardSampleSize]
        );
        await db.queryPromise('ALTER TABLE ids ADD INDEX (voter_id)');
        const result = await db.queryPromise(
            `UPDATE ??
        SET sample = ?
        WHERE voter_id IN (SELECT voter_id FROM ids)`,
            [votersTable, sampleNumber]
        );
        await db.queryPromise('DROP TABLE ids');
        console.warn(`${result.affectedRows} from ward ${ward} added to sample ${sampleNumber}`);
    }
}
