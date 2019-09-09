const db = require('../lib/db');
const NumberList = require('number-list');

module.exports = {

    assignPages(req, res) {
        const username = req.params.username;
        const pages = req.body;
        if (!Array.isArray(pages) || pages.filter(v => !/^\d+$/.test(v)).length) {
            res.sendStatus(400);
            return;
        }
        db.query(
            'UPDATE petition_lines SET checker = ? WHERE project_id = ? AND page IN (?)',
            [username, req.project.id, pages],
            function (err) {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }
                return res.sendStatus(204);
            }
        );
    },

    createOrUpdatePage(req, res) {
        const table = 'pages';
        const projectId = req.project.id;
        const data = req.body;
        data.project_id = projectId;
        if (data.date_signed) {
            data.date_signed = data.date_signed
                .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
        }
        if (!data.notes) {
            data.notes = '';
        }
        const id = data.id;
        let sql;
        const values = [];
        let number = +req.params.number;
        let numbers;
        if (id) {
            delete data.id;
            delete data.number;
            delete data.project_id;
            sql = 'UPDATE ' + table + ' SET ? WHERE id = ? AND project_id = ? AND number = ?';
            values.push(data, id, projectId, number);
            numbers = [number];
        }
        else {
            if (!data.number) {
                res.sendStatus(400);
                return;
            }
            numbers = NumberList.parse(data.number);
            sql = 'INSERT INTO ' + table + ' (' + Object.keys(data).join(', ') + ') VALUES';
            numbers.forEach(function (number, i) {
                data.number = number;
                if (i > 0) {
                    sql += ',';
                }
                sql += '(?)';
                values.push(Object.values(data));
            });
            number = numbers[0];
        }
        db.query(sql, values, function (err) {
            if (err) {
                console.log(table + ' SQL error', err);
                res.sendStatus(500);
                return;
            }
            let sql = 'INSERT IGNORE INTO petition_lines (project_id, page, line) VALUES ';
            const linesPerPage = 20;
            numbers.forEach(function (number, i) {
                if (i > 0) {
                    sql += ',';
                }
                for (let line = 1; line <= linesPerPage; line++) {
                    if (line > 1) {
                        sql += ',';
                    }
                    sql += '(' + projectId + ',' + number + ',' + line + ')';
                }
            });
            db.query(sql, function (err) {
                if (err) {
                    console.log(table + ' SQL error', err);
                    res.sendStatus(500);
                    return;
                }
                db.query(
                    'SELECT * FROM ' + table + ' WHERE project_id = ? AND number = ?',
                    [projectId, number],
                    function (err, rows) {
                        if (err) {
                            console.log(table + ' SQL error', err);
                            res.sendStatus(500);
                            return;
                        }
                        res.json(rows[0]);
                    }
                );
            });
        });
    },

    getPage(req, res) {
        const number = +req.params.number;
        const sql = 'SELECT * FROM pages WHERE project_id = ? AND number = ?';
        db.query(sql, [req.project.id, number], function (err, rows) {
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

    getPages(req, res) {
        const sql = 'SELECT p.*, c.name AS circulator_name, ' +
            "SUM(IF(l.finding IN ('', 'S'), 0, 1)) AS processed_lines, " +
            'COUNT(l.id) AS total_lines, ' +
            'GROUP_CONCAT(DISTINCT l.checker ORDER BY l.checker) AS checker ' +
            'FROM pages p LEFT JOIN circulators c ON p.circulator_id = c.id ' +
            'INNER JOIN petition_lines l ON p.project_id = l.project_id AND p.number = l.page ' +
            'WHERE p.project_id = ? ' +
            'GROUP BY p.number ORDER BY p.number';
        db.query(sql, [req.project.id], function (err, rows) {
            if (err) {
                console.error(err);
                res.sendStatus(500);
                return;
            }
            res.json(rows);
        });
    },

};
