#!/usr/bin/env node

const assert = require('assert');
const readline = require('readline');
const {Writable} = require('stream');
const yargs = require('yargs');
const db = require('../lib/db/admin');
const argv = getArgv();

main()
    .catch(console.error)
    .finally(() => db.close());

async function main() {
    const adminUser = argv['admin-user'];
    const adminPassword = argv['admin-password'] || await askPassword('Admin password: ');
    const {database, user, password} = argv;
    db.establishConnection({database: '', user: adminUser, password: adminPassword});
    const opts = await db.createDatabaseAndUser(database, user, password);
    console.log(opts);
}

function askPassword(question) {
    process.stdout.write('MySQL admin password: ');
    const mutedStdout = new Writable({
        write: (chunk, encoding, callback) => callback(),
    });
    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: mutedStdout,
        terminal: true,
    });
    return new Promise(resolve => readlineInterface.question(question, resolve))
        .then(function (password) {
            readlineInterface.close();
            return password;
        });
}

function getArgv() {
    return yargs
        .options({
            'admin-user': {
                type: 'string',
                describe: 'username for MySQL account that can create database',
                default: 'admin',
                requiresArg: true,
            },
            'admin-password': {
                type: 'string',
                describe: 'password for MySQL account that can create database (will prompt if not supplied)',
                requiresArg: true,
            },
            database: {
                type: 'string',
                describe: 'name for database',
                required: true,
                requiresArg: true,
            },
            user: {
                type: 'string',
                describe: 'username for MySQL account to create (defaults to database name)',
                requiresArg: true,
            },
            password: {
                type: 'string',
                describe: 'password for MySQL account to create (generated randomly if not supplied)',
                requiresArg: true,
            },
        })
        .usage('$0 <database>', 'create database', function (yargs) {
            yargs.positional('database', {
                type: 'string',
                describe: 'name for database to create',
            });
        })
        .check(function (argv) {
            assert.strictEqual(argv._.length, 0, 'Unexpected arguments after database name');
            return true;
        })
        .middleware(function (argv) {
            if (!argv.user) {
                argv.user = argv.database;
            }
            return true;
        })
        .strict(true)
        .argv;
}
