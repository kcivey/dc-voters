#!/usr/bin/env node

/*
    create table dcmj_phones (name varchar(255), last_name varchar(255), street varchar(255), apt varchar(255),
    city varchar(255), state varchar(255), zip varchar(255), email varchar(255), phone varchar(255));
    load data local infile 'DCMJ_PhoneNumber.csv' into table dcmj_phones fields terminated by ','
    optionally enclosed by '"' lines terminated by '\n' ignore 1 rows;
    alter table dcmj_phones add id smallint unsigned not null auto_increment first, add primary key (id);
    alter table dcmj_phones add normalized_address varchar(255), add normalized_phone varchar(12);
    alter table dcmj_phones add normalized_first varchar(255), add normalized_last varchar(255);
    alter table dcmj_phones add index (normalized_last, normalized_first), add index (normalized_address);
 */

const util = require('util');
const USPS = require('usps-webtools');
const db = require('../lib/db');
const usps = new USPS({
    server: 'https://secure.shippingapis.com/ShippingAPI.dll', // http://production.shippingapis.com/ShippingAPI.dll',
    userId: process.env.USPS_USERNAME,
    ttl: 10000, // TTL in milliseconds for request
});
const verify = util.promisify(usps.verify).bind(usps);

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    await setPhones();
    await setNames();
    await setDc();
    await setAddresses();
    await setPhoneForVoters();
}

async function setPhones() {
    const rows = await db.queryPromise(
        `SELECT id, phone
        FROM dcmj_phones
        WHERE normalized_phone IS NULL`
    );
    for (const r of rows) {
        const m = r.phone.replace(/\s+/g, '')
            .match(/^'?(?:\+?1)?\D?(\d{3})\D{0,2}(\d{3})\D?(\d{4})(?!\d)/);
        if (m) {
            const normalizedPhone = [m[1], m[2], m[3]].join('-');
            await db.queryPromise(
                'UPDATE dcmj_phones SET normalized_phone = ? WHERE id = ?',
                [normalizedPhone, r.id]
            );
        }
        else {
            console.warn(`Unexpected phone format "${r.phone}"`);
        }
    }
}

async function setNames() {
    const rows = await db.queryPromise(
        `SELECT id, name, last_name FROM dcmj_phones
        WHERE normalized_last IS NULL`
    );
    for (const r of rows) {
        const first = r.name.trim()
            .replace(/\.? .*/, '')
            .toUpperCase();
        let fullName = r.name;
        if (r.last_name) {
            fullName += ' ' + r.last_name;
        }
        fullName = fullName.trim()
            .replace(/\s*-\s*/g, '-')
            .replace(/ El$/i, '-El');
        const m = fullName.trim().match(/ (\S*\w)(?:,? ([JS]r|I+|I?V))?\.?\)?$/i);
        const last = m ? m[1].toUpperCase() : '';
        await db.queryPromise(
            `UPDATE dcmj_phones
            SET normalized_first = ?, normalized_last = ?
            WHERE id = ?`,
            [first, last, r.id]
        );
    }
}

function setDc() {
    return db.queryPromise(
        `UPDATE dcmj_phones SET state = 'DC'
        WHERE state = '' AND (
            LEFT(normalized_phone, 3) = '202' OR
            city = 'Washington'
        )`
    );
}

async function setAddresses() {
    const rows = await db.queryPromise(
        `SELECT id, street FROM dcmj_phones
        WHERE normalized_address IS NULL AND state = 'DC' AND street > ''`
    );
    for (const r of rows) {
        const street = r.street.trim()
            .replace(/\s+Washington,? DC.*/i, '')
            .replace(/,?\s+(?:Apt\.?|Apartment|#)\s*\S+$/i, '');
        if (street) {
            let normalizedAddress = '';
            const params = {
                street1: street,
                city: 'Washington',
                state: 'DC',
            };
            try {
                const result = await verify(params);
                console.warn(params, result);
                normalizedAddress = result.street1;
            }
            catch (err) {
                console.error(err);
                normalizedAddress = 'ERROR: ' + err.message;
            }
            await db.queryPromise(
                `UPDATE dcmj_phones
                SET normalized_address = ?
                WHERE id = ?`,
                [normalizedAddress, r.id]
            );
            await pause(100);
        }
        else {
            console.warn(`Unexpected address "${r.street}"`);
        }
    }
}

function pause(delay) {
    return new Promise(function (resolve) {
        setTimeout(resolve, delay);
    });
}

async function setPhoneForVoters() {
    const votersTable = await db.getMostRecentVotersTable();
    await db.queryPromise('UPDATE ?? SET dcmj_phone = NULL', votersTable);
    await db.queryPromise(
        `UPDATE ?? v
        SET v.dcmj_phone = (
            SELECT MAX(normalized_phone)
            FROM dcmj_phones d
            WHERE v.firstname = d.normalized_first
                AND v.lastname = d.normalized_last
                AND (
                    v.address = d.normalized_address
                    OR v.name_count = 1
                )
        )`,
        votersTable
    );
    const result = await db.queryPromise(
        `SELECT COUNT(*) AS count
        FROM ??
        WHERE dcmj_phone IS NOT NULL`,
        votersTable
    );
    console.warn(`${result[0].count} rows now have DCMJ phone`);
}
