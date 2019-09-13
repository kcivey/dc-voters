module.exports = function (db) {

    const {queryPromise} = db;

    db.getProjectByCode = function (code) {
        return queryPromise('SELECT * FROM projects WHERE code = ?', [code])
            .then(rows => rows[0] || null);
    };

    db.getProjectsForUser = function (user) {
        return queryPromise(
            'SELECT p.* FROM projects p INNER JOIN project_users pu ON p.id = pu.project_id WHERE pu.user_id = ?',
            [user.id]
        );
    };

};
