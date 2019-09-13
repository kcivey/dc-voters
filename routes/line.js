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
        const projectId = [req.project.id];
        const id = +req.params.id;
        const page = +req.params.page;
        const line = +req.params.line;
        db.getLine({projectId, id, page, line})
            .then(function (line) {
                if (line) {
                    res.json(line);
                }
                else {
                    res.sendStatus(404);
                }
            })
            .catch(function (err) {
                console.log(err);
                res.sendStatus(500);
            });
    },

    markLineBlank(req, res) {
        const projectId = req.project.id;
        const page = +req.params.page;
        const line = req.params.line;
        const updates = {
            finding: 'B',
            checker: req.user.username,
            check_time: new Date(),
        };
        db.updateLineOrRange({projectId, page, line, updates})
            .then(lineData => res.json(lineData))
            .catch(function (err) {
                console.log(err);
                res.sendStatus(500);
            });
    },

    updateLine(req, res) {
        const projectId = req.project.id;
        const id = +req.params.id;
        const updates = req.body;
        delete updates.id;
        updates.check_time = new Date();
        if (updates.date_signed) {
            updates.date_signed = updates.date_signed
                .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
        }
        db.updateLineOrRange({projectId, id, updates})
            .then(function (line) {
                if (line.date_signed) {
                    line.date_signed = moment(line.date_signed)
                        .utc()
                        .format('MM/DD/YYYY');
                }
                return res.json(line);
            })
            .catch(function (err) {
                console.log(err);
                res.sendStatus(500);
            });
    },

};
