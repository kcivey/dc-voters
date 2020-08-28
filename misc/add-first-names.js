#!/usr/bin/env node
'use strict';

const assert = require('assert');
const findConfig = require('find-config');
const dotEnvResult = require('dotenv').config({path: findConfig('.env')});
const {google} = require('googleapis');
const spreadsheetId = process.argv[2] || '1ICRqVxScQEsCD_hrhHb1YXbWT98fttGRRU8TBWm-K38';
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
        const nameIndex = headers.indexOf('voter_name');
        assert(nameIndex > -1, `Can't find name column in "${sheetTitle}"`);
        const firstNameIndex = headers.length;
        values[0].push('first_name');
        for (let i = 1; i < values.length; i++) {
            while (values[i].length < firstNameIndex) {
                values[i].push('');
            }
            values[i][firstNameIndex] = values[i][nameIndex].replace(/^(\S+) [^&]*$/, '$1')
                .replace(/^(\S+)(?: \S+)? & (\S+) .*/, '$1 & $2');
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
