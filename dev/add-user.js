#!/usr/bin/env node

const assert = require('assert');
const NumberList = require('number-list');
const argv = require('yargs')
    .options({
        admin: {
            type: 'boolean',
            describe: 'make the user an admin',
            default: false,
        },
        email: {
            type: 'string',
            describe: 'user\'s email',
            required: true,
            requiresArg: true,
        },
        name: {
            type: 'string',
            describe: 'user\'s name',
            requiresArg: true,
            defaultDescription: 'username',
        },
        pages: {
            type: 'string',
            describe: 'page range to assign to user',
            requiresArg: true,
            default: '',
            defaultDescription: 'none',
        },
        project: {
            type: 'string',
            describe: 'code for project',
            required: true,
        },
    })
    .check(function (argv) {
        assert.strictEqual(argv._.length, 1, 'Username required and no other arguments');
        assert(/^\w+$/.test(argv._[0]), 'Username must contain only letters, numbers, and underscores');
        return true;
    })
    .strict(true)
    .argv;
const db = require('../lib/db');

main()
    .then(() => console.log('Added'))
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const email = argv.email;
    const admin = argv.admin;
    const pages = NumberList.parse(argv.pages);
    const username = argv._[0].toLowerCase();
    const name = argv.name || username;
    const project = await db.getProjectByCode(argv.project);
    assert(project, `No such project "${project}"`);
    await db.createOrUpdateUser(project.id, {username, email, admin, name});
    if (pages.length) {
        const pagesAssigned = await db.assignPages(username, pages);
        console.warn('%d pages assigned', pagesAssigned);
    }
}
