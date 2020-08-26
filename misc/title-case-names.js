#!/usr/bin/env node
'use strict';

const assert = require('assert');
const findConfig = require('find-config');
const dotEnvResult = require('dotenv').config({path: findConfig('.env')});
const {google} = require('googleapis');
const spreadsheetId = process.argv[2] || '1_YhX2I6BDXvuMCBvQZwNjTtUk3kMSSZh6US0p5blYJc';
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
        for (let i = 1; i < values.length; i++) {
            values[i][nameIndex] = values[i][nameIndex]
                .replace(/\b(\w)(\w+)\b/g, (m, m1, m2) => m1 + m2.toLowerCase())
                .replace(/\b(Ii*|Iv)$/, m => m.toUpperCase());
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
