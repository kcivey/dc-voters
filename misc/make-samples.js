#!/usr/bin/env node

const db = require('../lib/db');
const sampleSize = 10000;

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const votersTable = await db.getMostRecentVotersTable();
    await markSigners(votersTable);
    await markSupervoters(votersTable);
    await markNewcomers(votersTable);
    await markGone(votersTable);
    await clearSamples(votersTable);
    await markRandom({votersTable, criteria: 'i71_signer > 0 AND supervoter > 0', sample: 1, sampleSize: 3000});
    await markRandom({votersTable, criteria: 'i71_signer > 0 AND supervoter = 0', sample: 2, sampleSize: 3000});
    await markRandom({votersTable, criteria: 'i71_signer = 0 AND supervoter > 0', sample: 3, sampleSize: 2000});
    await markRandom({votersTable, criteria: 'i71_signer = 0 AND supervoter = 0', sample: 4, sampleSize: 2000});
}

async function markSigners(votersTable) {
    await db.queryPromise('UPDATE ?? SET i71_signer = 0', votersTable);
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
        WHERE i71_signer = 0
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

async function markSupervoters(votersTable) {
    await db.queryPromise('UPDATE ?? SET supervoter = 0', votersTable);
    const result = await db.queryPromise(
        `UPDATE ??
        SET supervoter = 1
        WHERE h110618g IN ('A', 'V', 'Y')
            AND h110816g IN ('A', 'V', 'Y')
            AND h110414g IN ('A', 'V', 'Y')`,
        votersTable
    );
    console.warn(result.affectedRows, 'marked as supervoters');
}

async function markNewcomers(votersTable) {
    await db.queryPromise('UPDATE ?? SET newcomer = 0', votersTable);
    const result = await db.queryPromise(
        `UPDATE ??
        SET newcomer = 1
        WHERE registered > '2018-11-06'`,
        votersTable
    );
    console.warn(result.affectedRows, 'marked as newcomers');
}

async function markGone(votersTable) {
    await db.queryPromise('UPDATE ?? SET gone = 0', votersTable);
    const result = await db.queryPromise(
        `UPDATE ??
        SET gone = 1
        WHERE NOT newcomer AND
            NOT (
                h120418s IN ('A', 'V', 'Y') OR
                h110618g IN ('A', 'V', 'Y') OR
                h061918p IN ('A', 'V', 'Y') OR
                h110816g IN ('A', 'V', 'Y') OR
                h061416p IN ('A', 'V', 'Y')
            )`,
        votersTable
    );
    console.warn(result.affectedRows, 'marked as gone');
}

function clearSamples(votersTable) {
    return db.queryPromise('UPDATE ?? SET sample = NULL', votersTable);
}

async function markRandom({votersTable, criteria, sample, sampleSize}) {
    const where = 'WHERE sample IS NULL' + (criteria ? ' AND ' + criteria : '');
    const wardSampleSize = Math.ceil(sampleSize / 8);
    for (let ward = 1; ward <= 8; ward++) {
        await db.queryPromise(
            `CREATE TEMPORARY TABLE ids
            SELECT voter_id
            FROM ??
            ${where} AND ward = ? AND NOT gone AND not newcomer
            ORDER BY RAND()
            LIMIT ?`,
            [votersTable, ward, wardSampleSize]
        );
        await db.queryPromise('ALTER TABLE ids ADD INDEX (voter_id)');
        const result = await db.queryPromise(
            `UPDATE ??
        SET sample = ?
        WHERE voter_id IN (SELECT voter_id FROM ids)`,
            [votersTable, sample]
        );
        await db.queryPromise('DROP TABLE ids');
        console.warn(`${result.affectedRows} from ward ${ward} added to sample ${sample}`);
    }
}
