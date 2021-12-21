#!/usr/bin/env node

const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const records = await db.queryPromise(
        `SELECT *
        FROM zottoli
        WHERE street_address <> '' AND fixed_address IS NULL`
    );
    for (const r of records) {
        const address = r.street_address
            .replace(/^(\d+) .* (\1 .*)$/, '$2')
            .replace(/ Stre(?:et|ss) (?=[NS][EW])/, ' St ')
            .replace(/ Circle (?=[NS][EW])/, ' Cir ');
        await db.queryPromise(
            `UPDATE zottoli
            SET fixed_address = ?
            WHERE first_name = ? AND last_name = ? AND middle = ? AND street_address = ?`,
            [address, r.first_name, r.last_name, r.middle, r.street_address]
        );
    }
}
