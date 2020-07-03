#!/usr/bin/env node

const assert = require('assert');
const db = require('../lib/db');
const argv = require('yargs')
    .options({
        'dry-run': {
            type: 'boolean',
            describe: 'don\'t actually mark, just say how many would be marked',
            default: false,
        },
        project: {
            type: 'string',
            describe: 'code for project',
            required: true,
        },
    })
    .strict(true)
    .argv;

main()
    .then(() => console.log('Marked'))
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const project = await db.getProjectByCode(argv.project);
    assert(project, `No such project "${project}"`);
    const projectId = project.id;
    const rows = await db.getDuplicateLines(projectId);
    console.warn('%d duplicates found', rows.length);
    if (argv['dry-run']) {
        console.warn('Skipping updates because this is a dry run');
        return;
    }
    for (const row of rows) {
        let notes = row.duplicate_notes || '';
        let finding = row.duplicate_finding;
        if (notes) {
            notes += '; ';
        }
        notes += `Duplicate of page ${row.original_page}, line ${row.original_line}`;
        if (finding === 'OK') {
            finding = 'D';
        }
        const updates = {finding, notes};
        const page = row.duplicate_page;
        const line = row.duplicate_line;
        await db.updateLineOrRange({projectId, page, line, updates});
    }
}
