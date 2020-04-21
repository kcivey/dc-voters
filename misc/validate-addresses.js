#!/usr/bin/env node

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
    const votersTable = await db.getMostRecentVotersTable();
    const records = await db.queryPromise(
        `SELECT voter_id, res_house, res_frac, res_street, res_apt, res_zip
        FROM ??
        WHERE sample IS NOT NULL
            AND validated_address_1 IS NULL
        LIMIT 10000`,
        [votersTable]
    );
    for (const r of records) {
        let address = r.res_house;
        if (r.res_frac) {
            address += '-' + r.res_frac;
        }
        address += ' ' + r.res_street;
        const params = {
            street1: address,
            street2: r.res_apt,
            city: 'Washington',
            state: 'DC',
            zip: r.res_zip,
        };
        let street1 = null;
        let street2 = null;
        let zip = null;
        try {
            const result = await verify(params);
            console.warn(params, result);
            street1 = result.street1;
            street2 = result.street2;
            zip = result.zip + '-' + result.zip4;
        }
        catch (err) {
            console.error(err);
            street1 = 'ERROR:' + err.message;
        }
        await db.queryPromise(
            `UPDATE ??
            SET validated_address_1 = ?, validated_address_2 = ?, validated_zip = ?
            WHERE voter_id = ?`,
            [votersTable, street1, street2, zip, r.voter_id]
        );
        await pause(100);
    }
}

function pause(delay) {
    return new Promise(function (resolve) {
        setTimeout(resolve, delay);
    });
}
