module.exports = function (db) {

    const {queryPromise} = db;

    db.getProjectByCode = function (code) {
        return queryPromise('SELECT * FROM projects WHERE code = ? AND NOT archived', [code])
            .then(rows => (rows[0] ? adjustProject(rows[0]) : null));
    };

    db.getProjectsForUser = function (user) {
        return queryPromise(
            `SELECT p.*
            FROM projects p INNER JOIN project_users pu ON p.id = pu.project_id
            WHERE pu.user_id = ? AND NOT p.archived`,
            [user.id]
        )
            .then(projects => projects.map(adjustProject));
    };

};

function adjustProject(rawProject) {
    const project = {};
    for (const [key, value] of Object.entries(rawProject)) {
        const newKey = key.replace(/_(\w)/g, (m, m1) => m1.toUpperCase()); // camelize
        project[newKey] = value;
    }
    if (project.findingCodes) {
        project.findingCodes = JSON.parse(project.findingCodes);
        if (!Object.keys(project.findingCodes).length) {
            project.findingCodes = null;
        }
    }
    if (!project.findingCodes) {
        project.findingCodes = {
            OK: 'OK (name and address match)',
            A: 'address change (distinctive name matches but address does not)',
            NM: 'possible name variation/change (address matches)',
            NR: 'not registered',
            I: 'illegible (or missing name)',
            MA: 'missing address',
            MD: 'missing date',
            MS: 'missing (or forged) signature',
            WP: 'wrong party',
            WW: 'wrong ward',
            OP: 'signature or other info out of place',
            D: 'duplicate',
            B: 'blank (or scratched out)',
        };
        if (project.type !== 'petition') {
            project.findingCodes.CA = 'circulator failed to complete required information in affidavit';
        }
        project.findingCodes.S = 'skip for now and deal with it later';
    }
    for (const name of ['batches', 'voterCounts']) {
        if (project[name]) {
            project[name] = project[name].split(/\s*,\s*/)
                .map(n => +n);
        }
    }
    project.circulatorStatuses = project.circulatorStatuses ? JSON.parse(project.circulatorStatuses) : {};
    const findingCodes = project.findingCodes;
    // @todo Handle this better (probably need a table for finding codes)
    for (const [code, label] of Object.entries(findingCodes)) {
        if ((!project.party && /\bparty\b/i.test(label)) || (!project.ward && /\bward\b/i.test(label))) {
            delete findingCodes[code];
        }
    }
    return project;
}
