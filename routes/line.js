const db = require('../lib/db');
const moment = require('moment');

module.exports = {

    // Return line data in DataTables format
    dtLine(req, res) {
        const start = +req.query.start || 0;
        const length = +req.query.length || 100;
        const output = {draw: +req.query.draw || 1};
        const search = req.query.search && req.query.search.value;
        const columns = req.query.columns || [];
        const order = req.query.order || [];
        const checker = req.query.checker || req.params.checker;
        const filterColumn = req.query.filterColumn || '';
        const filterValue = req.query.filterValue;
        const table = 'petition_lines';
        let sql = 'SELECT COUNT(*) AS `count` FROM ' + table;
        let where = " WHERE finding <> ''";
        const orderSql = [];
        const values = [];
        db.query(sql, function (err, rows) {
            if (err) {
                console.error(err);
                res.sendStatus(500);
                return;
            }
            output.recordsTotal = +rows[0].count;
            if (checker) {
                where += ' AND checker = ?';
                values.push(checker);
            }
            if (/^\w+$/.test(filterColumn)) {
                where += ' AND `' + filterColumn + '` = ?';
                values.push(filterValue);
            }
            sql += where;
            db.query(sql, values, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                output.recordsFiltered = +rows[0].count;
                sql = 'SELECT * FROM ' + table + where;
                if (search) {
                    sql += ' AND (';
                    ['voter_name', 'address', 'checker'].forEach(function (column, i) {
                        if (i > 0) {
                            sql += ' OR ';
                        }
                        sql += column + ' LIKE ?';
                        values.push('%' + search + '%');
                    });
                    sql += ')';
                }
                order.forEach(function (o) {
                    const index = +o.column || 0;
                    const column = columns[index] ? columns[index].data : '';
                    if (/^\w+$/.test(column) && column !== 'function') {
                        orderSql.push(column + (o.dir === 'desc' ? ' DESC' : ''));
                    }
                });
                orderSql.push('check_time DESC', 'id DESC'); // sort newest first if nothing else
                sql += ' ORDER BY ' + orderSql.join(', ') +
                    ' LIMIT ' + start + ',' + length;
                db.query(sql, values, function (err, rows) {
                    if (err) {
                        console.error(err);
                        res.sendStatus(500);
                        return;
                    }
                    output.data = rows;
                    res.json(output);
                });
            });
        });
    },

    getLine(req, res) {
        const id = +req.params.id;
        const page = +req.params.page;
        const line = +req.params.line;
        let sql = 'SELECT * FROM petition_lines WHERE project_id = ? AND ';
        const values = [req.project.id];
        if (id) {
            sql += 'id = ?';
            values.push(id);
        }
        else {
            sql += 'page = ? AND line = ?';
            values.push(page, line);
        }
        sql += ' LIMIT 1';
        db.query(sql, values, function (err, rows) {
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

    markLineBlank(req, res) {
        const page = +req.params.page;
        const line = req.params.line;
        let sql = 'UPDATE petition_lines SET ? WHERE project_id = ? AND checker = ? AND page = ? AND line ';
        const values = [
            {finding: 'B', checker: req.user.username, check_time: new Date()},
            req.project.id,
            req.user.username,
            page,
        ];
        const m = line.match(/^(\d+)-(\d+)$/);
        if (m) {
            sql += ' BETWEEN ? AND ?';
            values.push(+m[1], +m[2]);
        }
        else {
            sql += ' = ?';
            values.push(+line);
        }
        db.query(sql, values, function (err, results) {
            if (err) {
                console.error(err);
                res.sendStatus(500);
                return;
            }
            res.json({results});
        });
    },

    updateLine(req, res) {
        const id = +req.params.id;
        const lineData = req.body;
        delete lineData.id;
        lineData.check_time = new Date();
        if (lineData.date_signed) {
            lineData.date_signed = lineData.date_signed
                .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
        }
        db.query(
            'UPDATE petition_lines SET ? WHERE id = ?',
            [lineData, id],
            function (err) {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }
                return db.query(
                    'SELECT * FROM petition_lines WHERE id = ?',
                    [id],
                    function (err, rows) {
                        if (err) {
                            console.error(err);
                            return res.sendStatus(500);
                        }
                        const lineData = rows[0];
                        if (lineData.date_signed) {
                            lineData.date_signed = moment(lineData.date_signed)
                                .utc()
                                .format('MM/DD/YYYY');
                        }
                        return res.json(lineData);
                    }
                );
            }
        );
    },

};
