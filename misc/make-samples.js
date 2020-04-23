#!/usr/bin/env node

const db = require('../lib/db');

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
    await markRandom({votersTable, criteria: 'i71_signer > 0 AND supervoter = 0', sample: 2, sampleSize: 3000});
    await markRandom({votersTable, criteria: 'i71_signer > 0 AND supervoter > 0', sample: 1, sampleSize: 3000});
    await markRandom({votersTable, criteria: 'i71_signer = 0 AND supervoter = 0', sample: 4, sampleSize: 2000});
    await markRandom({votersTable, criteria: 'i71_signer = 0 AND supervoter > 0', sample: 3, sampleSize: 2000});
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
    return db.queryPromise('UPDATE ?? SET sample = NULL, household_in_sample = 0', votersTable);
}

async function markRandom({votersTable, criteria, sample, sampleSize}) {
    const where = 'WHERE sample IS NULL' + (criteria ? ' AND ' + criteria : '');
    const wardSampleSize = Math.ceil(sampleSize / 8);
    for (let ward = 1; ward <= 8; ward++) {
        await db.queryPromise(
            `CREATE TEMPORARY TABLE ids
            SELECT MAX(voter_id) AS voter_id, res_house, res_frac, res_street, res_apt
            FROM ??
            ${where} AND ward = ? AND NOT gone AND NOT newcomer AND NOT household_in_sample
            GROUP BY res_house, res_frac, res_street, res_apt
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
        await db.queryPromise(
            `CREATE TEMPORARY TABLE ids
            SELECT MAX(voter_id) AS voter_id, res_house, res_frac, res_street, res_apt
            FROM ??
            WHERE sample = ? AND ward = ?
            GROUP BY res_house, res_frac, res_street, res_apt`,
            [votersTable, sample, ward]
        );
        await db.queryPromise('ALTER TABLE ids ADD INDEX (res_house, res_frac, res_street, res_apt)');
        await db.queryPromise(
            `UPDATE ?? v, ids i
            SET v.household_in_sample = 1
            WHERE v.res_house = i.res_house AND
                v.res_frac = i.res_frac AND
                v.res_street = i.res_street AND
                v.res_apt = i.res_apt`,
            votersTable
        );
        await db.queryPromise('DROP TABLE ids');
    }
}
