const createError = require('http-errors');
const NumberList = require('number-list');

module.exports = function (db) {

    const {makeSqlCriteria, queryPromise} = db;

    db.createOrUpdateUser = function (projectId, userData, id = null) {
        delete userData.project_id;
        delete userData.id;
        delete userData.projects;
        const values = [userData];
        let sql;
        if (id) {
            sql = 'UPDATE users SET ? WHERE id = ?';
            values.push(id);
        }
        else {
            sql = 'INSERT INTO users SET ?';
        }
        return queryPromise(sql, values)
            .then(function (result) {
                if (result.insertId) {
                    id = result.insertId;
                }
                if (!id) {
                    throw createError(500, 'No insert ID');
                }
                return queryPromise(
                    'INSERT IGNORE INTO project_users SET ?',
                    [{project_id: projectId, user_id: id}]
                );
            })
            .then(() => db.getUser({id}));
    };

    db.getUser = function (criteria) {
        const [criteriaSql, criteriaValues] = makeSqlCriteria(criteria);
        return queryPromise(`SELECT * FROM users WHERE ${criteriaSql} LIMIT 1`, criteriaValues)
            .then(function (rows) {
                const user = rows[0] || null;
                if (!user) {
                    return null;
                }
                return db.getProjectsForUser(user)
                    .then(function (projects) {
                        user.projects = projects;
                        return user;
                    });
            });
    };

    db.avgTimeSql =
        // first line is there to set the initial values of the variables
        `SELECT 9999999 AS diff, @prev := NULL, @prev_checker := NULL AS checker, 'B' AS finding
        UNION ALL
        (SELECT
            TO_SECONDS(check_time) - IF(checker <> @prev_checker, 0, @prev) AS diff,
            @prev := TO_SECONDS(check_time),
            @prev_checker := checker AS checker,
            finding
        FROM (
            SELECT checker, check_time, finding
            FROM petition_lines
            WHERE checker IS NOT NULL AND check_time IS NOT NULL
            ORDER BY checker, check_time
        ) sorted)`;

    db.avgTimeMax = 300;

    db.getUsersForProject = function (projectId) {
        const subquery =
            `SELECT checker, AVG(diff) AS avg_time
            FROM (${db.avgTimeSql}) t
            WHERE diff <= ${db.avgTimeMax} AND finding <> 'B'
            GROUP BY checker`;
        const sql =
            `SELECT u.*,
                COUNT(DISTINCT l.page) AS page_count,
                GROUP_CONCAT(DISTINCT l.page ORDER BY l.page) AS pages,
                MIN(d.avg_time) AS avg_time
            FROM users u
                LEFT JOIN petition_lines l ON u.username = l.checker AND l.project_id = ?
                LEFT JOIN (${subquery}) d ON u.username = d.checker
                INNER JOIN project_users pu ON u.id = pu.user_id
            WHERE pu.project_id = ?
            GROUP BY u.id
            ORDER BY u.username`;
        return queryPromise(sql, [projectId, projectId])
            .then(function (rows) {
                rows.forEach(function (row) {
                    row.pages = row.pages ? NumberList.stringify(row.pages.split(',')) : '';
                });
                return rows;
            });
    };

    db.getUsernamesForProject = function (projectId) {
        const sql = 'SELECT u.username ' +
            'FROM users u INNER JOIN project_users pu ON u.id = pu.user_id ' +
            'WHERE pu.project_id = ? ' +
            'ORDER BY u.username';
        return queryPromise(sql, [projectId])
            .then(rows => rows.map(row => row.username));
    };

    db.addUserToProject = function (projectId, userId) {
        return queryPromise(
            'INSERT INTO project_users (project_id, user_id) VALUES (?, ?)',
            [projectId, userId]
        );
    };
};

