#!/usr/bin/env node
'use strict';

const assert = require('assert');
const util = require('util');
const findConfig = require('find-config');
const dotEnvResult = require('dotenv').config({path: findConfig('.env')});
const {google} = require('googleapis');
const USPS = require('usps-webtools');
const usps = new USPS({
    server: 'https://secure.shippingapis.com/ShippingAPI.dll', // http://production.shippingapis.com/ShippingAPI.dll',
    userId: process.env.USPS_USERNAME,
    ttl: 10000, // TTL in milliseconds for request
});
const verify = util.promisify(usps.verify).bind(usps);
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const googleAccountKey = require(findConfig(process.env.GOOGLE_ACCOUNT_KEY_FILE));

if (dotEnvResult.error) {
    throw dotEnvResult.error;
}

main()
    .catch(function (err) {
        console.error(err);
        process.exit(1);
    });

async function main() {
    const auth = new google.auth.JWT(
        googleAccountKey.client_email,
        null,
        googleAccountKey.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({version: 'v4', auth});
    const sheetTitles = (await sheets.spreadsheets.get({spreadsheetId})).data.sheets
        .map(s => s.properties.title);
    for (const sheetTitle of sheetTitles) {
        let result = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetTitle}'`,
            auth,
        });
        if (result.statusText !== 'OK') {
            console.warn(result);
            throw new Error('Error in getting values');
        }
        const values = result.data.values;
        const headers = values[0];
        for (let i = 1; i < values.length; i++) {
            assert(values[i].length <= headers.length, `Too many columns in "${sheetTitle}", row ${i}`);
            const row = {};
            for (let j = 0; j < headers.length; j++) {
                row[headers[j]] = values[i][j];
            }
            if (row.address) {
                const params = {
                    street1: row.address,
                    city: 'Washington',
                    state: 'DC',
                };
                let street1 = '';
                let street2 = '';
                let zip = '';
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
                values[i].push(street1, street2, zip);
            }
        }
        result = await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetTitle}'`,
            valueInputOption: 'RAW',
            resource: {values},
            auth,
        });
        if (result.statusText !== 'OK') {
            console.warn(result);
            throw new Error('Error in updating sheet');
        }
        console.warn(`"${sheetTitle}" updated`);
    }
}
