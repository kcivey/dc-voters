const db = require('../lib/db');
const NumberList = require('number-list');

module.exports = {

    createOrUpdateUser(req, res) {
        const userData = req.body;
        let id = +req.params.id;
        const values = [userData];
        let sql;
        if (id) {
            delete userData.id;
            sql = 'UPDATE users SET ? WHERE id = ?';
            values.push(id);
        }
        else {
            if (!userData.username || !userData.email) {
                res.sendStatus(400);
                return;
            }
            sql = 'INSERT INTO users SET ?';
        }
        db.query(sql, values, function (err, result) {
            if (err) {
                console.log('user SQL error', err);
                res.sendStatus(500);
                return;
            }
            if (result.insertId) {
                id = result.insertId;
            }
            if (!id) {
                res.sendStatus(500);
                return;
            }
            db.query(
                'INSERT IGNORE INTO project_users SET ?',
                [{project_id: req.project.id, user_id: id}],
                function (err) {
                    if (err) {
                        console.log('user SQL error', err);
                        res.sendStatus(500);
                        return;
                    }
                    db.query(
                        'SELECT * FROM users WHERE id = ?',
                        [id],
                        function (err, rows) {
                            if (err) {
                                console.log(err);
                                return res.sendStatus(500);
                            }
                            return res.json(rows[0]);
                        }
                    );

                }
            );
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
