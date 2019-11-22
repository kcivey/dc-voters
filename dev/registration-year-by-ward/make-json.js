#!/usr/bin/env node

const db = require('../../lib/db');

main().catch(console.err)
    .finally(() => db.close());

async function main() {
    const columns = [['year']];
    for (let ward = 1; ward <= 8; ward++) {
        columns.push([`Ward ${ward}`]);
    }
    const records = await db.queryPromise(
        `SELECT YEAR(v1.registered) AS year, ward, COUNT(*),
            100.0 * COUNT(*) / (SELECT COUNT(*) FROM voters v2 WHERE v2.ward = v1.ward) AS percent
        FROM voters v1
        WHERE ward > 0 AND registered BETWEEN '1968-01-01' AND NOW()
        GROUP BY year, ward
        ORDER BY year, ward`
    );
    let prevYear = 0;
    const firstYear = 0; // new Date().getFullYear() - 25;
    if (firstYear) {
        columns[0].push(`${firstYear} and earlier`);
    }
    for (const r of records) {
        if (r.year <= firstYear) {
            if (!columns[r.ward][1]) {
                columns[r.ward][1] = 0;
            }
            columns[r.ward][1] += r.percent;
            continue;
        }
        if (prevYear !== r.year) {
            columns[0].push(r.year);
            prevYear = r.year;
        }
        columns[r.ward].push(r.percent);
    }
    for (let ward = 1; ward <= 8; ward++) {
        columns[ward] = columns[ward].map(v => (typeof v === 'number' ? +v.toFixed(2) : v));
    }
    process.stdout.write(JSON.stringify(columns));
}
