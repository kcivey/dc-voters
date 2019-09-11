const db = require('../lib/db');
const NumberList = require('number-list');

module.exports = {

    createOrUpdateUser(req, res) {
        const projectId = req.project.id;
        const userData = req.body;
        const id = +req.params.id;
        if (!id && !(userData.username && userData.email)) {
            return res.sendStatus(400);
        }
        return db.createOrUpdateUser(projectId, userData, id, function (err, user) {
            if (err) {
                console.log(err);
                return res.sendStatus(500);
            }
            return res.json(user);
        });
    },

    getUser(req, res) {
        const id = +req.params.id;
        const sql = 'SELECT * FROM users WHERE id = ?';
        db.query(sql, [id], function (err, rows) {
            if (err) {
                console.error(err);
                res.sendStatus(500);
                return;
            }
            if (rows.length) {
                res.json(rows[0]);
            }
            else {
                res.sendStatus(404);
            }
        });
    },

    getUsers(req, res) {
        const sql = 'SELECT u.*, COUNT(DISTINCT l.page) AS page_count,' +
            'GROUP_CONCAT(DISTINCT l.page ORDER BY l.page) AS pages ' +
            'FROM users u LEFT JOIN petition_lines l ON u.username = l.checker ' +
            'INNER JOIN project_users pu ON u.id = pu.user_id ' +
            'WHERE (l.project_id = ? OR l.project_id IS NULL) AND pu.project_id = ? ' +
            'GROUP BY u.id ORDER BY u.username';
        db.query(sql, [req.project.id, req.project.id], function (err, rows) {
            if (err) {
                console.error(err);
                res.sendStatus(500);
                return;
            }
            rows.forEach(function (row) {
                row.pages = row.pages ? NumberList.stringify(row.pages.split(',')) : '';
            });
            res.json(rows);
        });
    },

};
