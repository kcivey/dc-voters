const db = require('../lib/db');
const NumberList = require('number-list');

module.exports = {

    createOrUpdateCirculator(req, res) {
        const table = 'circulators';
        let id = +req.params.id;
        const data = req.body;
        const values = [data];
        let sql;
        if (!data.notes) {
            data.notes = '';
        }
        if (id) {
            delete data.id;
            sql = 'UPDATE ' + table + ' SET ? WHERE id = ?';
            values.push(id);
        }
        else {
            if (!data.name) {
                res.sendStatus(400);
                return;
            }
            sql = 'INSERT INTO ' + table + ' SET ?';
        }
        db.query(sql, values, function (err, result) {
            if (err) {
                console.log(table + ' SQL error', err);
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
                'SELECT * FROM ' + table + ' WHERE id = ?',
                [id],
                function (err, rows) {
                    if (err) {
                        console.log(err);
                        return res.sendStatus(500);
                    }
                    return res.json(rows[0]);
                }
            );
        });
    },

    deleteCirculator(req, res) {
        const table = 'circulators';
        const id = +req.params.id;
        db.query(
            'SELECT COUNT(*) FROM pages WHERE circulator_id = ?',
            [id],
            function (err, result) {
                if (err) {
                    console.log(table + ' SQL error', err);
                    res.sendStatus(500);
                    return;
                }
                if (result[0] === 0) {
                    res.sendStatus(409); // can't delete circulator if they have pages
                    return;
                }
                db.query(
                    'DELETE FROM ' + table + ' WHERE id = ?',
                    [id],
                    function (err) {
                        if (err) {
                            console.log(err);
                            return res.sendStatus(500);
                        }
                        return res.sendStatus(204);
                    }
                );
            }
        );
    },

    getCirculator(req, res) {
        const id = +req.params.id;
        const sql = 'SELECT * FROM circulators WHERE id = ?';
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

    getCirculators(req, res) {
        // @todo Handle connection of circulators to projects
        const sql = 'SELECT c.*, COUNT(DISTINCT p.number) AS page_count, ' +
            'GROUP_CONCAT(DISTINCT p.number ORDER BY p.number) AS pages, ' +
            "SUM(CASE WHEN l.finding NOT IN ('', 'S', 'B') THEN 1 ELSE 0 END) AS processed_lines, " +
            "SUM(CASE WHEN l.finding = 'OK' THEN 1 ELSE 0 END) AS valid_lines " +
            'FROM circulators c LEFT JOIN pages p ON p.circulator_id = c.id ' +
            'LEFT JOIN petition_lines l ON l.project_id = p.project_id AND l.page = p.number ' +
            'WHERE (p.project_id = ? OR p.project_id IS NULL) ' +
            'GROUP BY c.id ORDER BY c.name';
        db.query('SET group_concat_max_len = 8192', function (err) {
            if (err) {
                console.error(err);
                res.sendStatus(500);
                return;
            }
            db.query(sql, [req.project.id], function (err, rows) {
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
        });
    },

};
