#!/usr/bin/env node

const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const votersTable = await db.getMostRecentVotersTable();
    // ALTER TABLE voters_* ADD mailing TINYINT(1) UNSIGNED NOT NULL DEFAULT 0
    const mailingTable = 'mailing';
    await db.queryPromise(
        'CREATE TEMPORARY TABLE ?? SELECT * FROM ?? LIMIT 0',
        [mailingTable, votersTable]
    );
    await db.queryPromise(
        `ALTER TABLE ??
        ADD UNIQUE (res_house, res_frac, res_street, res_apt),
        ADD UNIQUE (voter_id)`,
        mailingTable
    );
    await db.queryPromise(
        `INSERT IGNORE INTO ??
        SELECT * FROM ??
        WHERE registered > '2018-11-06' OR
            h120418s IN ('A', 'V', 'Y') OR
            h110618g IN ('A', 'V', 'Y') OR
            h061918p IN ('A', 'V', 'Y') OR
            h110816g IN ('A', 'V', 'Y') OR
            h061416p IN ('A', 'V', 'Y')
        ORDER BY (
            IF(h120418s IN ('A', 'V', 'Y'), 1, 0) +
            IF(h110618g IN ('A', 'V', 'Y'), 2, 0) +
            IF(h061918p IN ('A', 'V', 'Y'), 2, 0) +
            IF(h110816g IN ('A', 'V', 'Y'), 1, 0) +
            IF(h061416p IN ('A', 'V', 'Y'), 1, 0)
        ) DESC, registered DESC`,
        [mailingTable, votersTable]
    );
    await db.queryPromise(
        'UPDATE ?? SET mailing = 0',
        votersTable
    );
    await db.queryPromise(
        `UPDATE ?? v SET v.mailing = 1
        WHERE v.voter_id IN (SELECT m.voter_id FROM ?? m)`,
        [votersTable, mailingTable]
    );
}

/*
    SELECT v.*,
        (
            IF(h120418s IN ('A', 'V', 'Y'), 1, 0) +
            IF(h110618g IN ('A', 'V', 'Y'), 2, 0) +
            IF(h061918p IN ('A', 'V', 'Y'), 2, 0) +
            IF(h110816g IN ('A', 'V', 'Y'), 1, 0) +
            IF(h061416p IN ('A', 'V', 'Y'), 1, 0)
        ) AS vote_score,
        ve.van_id
    FROM voters_20200513 v
        INNER JOIN voters_extra ve ON v.voter_id = ve.voter_id
    WHERE res_street > '' AND
        van_id > '' AND
        (
            registered > '2018-11-06' OR
            h120418s IN ('A', 'V', 'Y') OR
            h110618g IN ('A', 'V', 'Y') OR
            h061918p IN ('A', 'V', 'Y') OR
            h110816g IN ('A', 'V', 'Y') OR
            h061416p IN ('A', 'V', 'Y')
        )
    ORDER BY res_house, res_frac, res_street, res_apt,
        vote_score DESC,
        registered DESC
 */
