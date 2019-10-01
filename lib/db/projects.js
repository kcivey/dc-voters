module.exports = function (db) {

    const {queryPromise} = db;

    db.getProjectByCode = function (code) {
        return queryPromise('SELECT * FROM projects WHERE code = ?', [code])
            .then(rows => (rows[0] ? adjustProject(rows[0]) : null));
    };

    db.getProjectsForUser = function (user) {
        return queryPromise(
            'SELECT p.* FROM projects p INNER JOIN project_users pu ON p.id = pu.project_id WHERE pu.user_id = ?',
            [user.id]
        )
            .then(projects => projects.map(adjustProject));
    };

};

function adjustProject(project) {
    project.config = Object.assign(
        {
            findingCodes: {
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
                D: 'duplicate',
                B: 'blank (or scratched out)',
                S: 'skip for now and deal with it later',
            },
            circulatorStatuses: {},
        },
        project.config ? JSON.parse(project.config) : {},
    );
    const config = project.config;
    const findingCodes = config.findingCodes;
    // @todo Handle this better (probably need a table for finding codes)
    for (const [code, label] of Object.entries(findingCodes)) {
        if ((!config.party && /\bparty\b/i.test(label)) || (!config.ward && /\bward\b/i.test(label))) {
            delete findingCodes[code];
        }
    }
    return project;
}
