#!/usr/bin/env node

const readline = require('readline');
const db = require('../lib/db/admin');
const readlineInterface = readline.createInterface({input: process.stdin, output: process.stdout});

main()
    .catch(console.error)
    .finally(() => db.close());

async function main() {
    const adminUser = await ask('Admin user [admin]: ') || 'admin';
    const adminPassword = await ask('Admin password: ');
    const database = await ask('Database name [dc_voters]: ');
    db.establishConnection({database: '', user: adminUser, password: adminPassword});
    const user = await ask(`Username [${database}]: `);
    const password = await ask('Password: [(random)]: ');
    const opts = await db.createDatabaseAndUser(database, user, password);
    readlineInterface.close();
    console.log(opts);
}

function ask(question) {
    return new Promise(resolve => readlineInterface.question(question, resolve));
}
