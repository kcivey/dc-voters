module.exports = function (app) {
    const fs = require('fs');
    const _ = require('underscore');
    const moment = require('moment');
    const async = require('async');
    const config = require('../public/config.json');
    const db = require('../lib/db');
    const pkg = require('../package.json');
    const NumberList = require('number-list');
    const challengeTemplate = _.template(
        fs.readFileSync(__dirname + '/challenge.html', {encoding: 'utf8'})
            .replace(/^\s+/gm, '')
    );

    function sendTsv(req, res, sql, values) {
        const m = req.path.match(/([^\/]+)$/);
        let filename;
        if (m) {
            filename = m[1];
        }
        else {
            filename = 'data.tsv';
        }
        db.query(sql, values, function (err, rows, fields) {
            if (err) {
                console.error(err);
                res.sendStatus(500);
                return;
            }
            const fieldNames = _.pluck(fields, 'name');
            let content = fieldNames.join('\t') + '\n';
            _.forEach(rows, function (row) {
                content += _.map(fieldNames, function (name) {
                    if (name === 'check_time' && row.check_time) {
                        return moment(row.check_time).format('YYYY-MM-DD HH:mm:ss');
                    }
                    if (name === 'date_signed' && row.date_signed) {
                        return moment(row.date_signed).format('YYYY-MM-DD');
                    }
                    if (_.isString(row[name])) {
                        return row[name].replace(/[\n\r\t]/g, ' ');
                    }
                    return row[name];
                }).join('\t') + '\n';
            });
            res.attachment(filename);
            res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
            res.send(content);
        });
    }

    return {
        search: function (req, res) {
            const q = req.query.q;
            const voterId = req.query.voter_id;
            let name = req.query.name;
            let address = req.query.address;
            let explanation = '';
            let match = '';
            if (q) {
                match = 'MATCH (v.firstname, v.lastname, v.res_house, v.res_street) AGAINST (? IN BOOLEAN MODE)';
                explanation += 'General query: ' + q + '\n';
            }
            let sql = 'SELECT v.registered, v.lastname, v.firstname, v.middle, v.suffix, v.status, v.res_house, ' +
                'v.res_frac, v.res_apt, v.res_street, v.ward, v.voter_id';
            const values = [];
            const limit = Math.min(100, Math.max(0, Math.round(+req.query.limit))) || 10;
            if (config.party) {
                sql += ', v.party';
            }
            if (match) {
                sql += ', ' + match + ' AS score';
                values.push(q);
            }
            sql += ' FROM voters v WHERE 1';
            if (name) {
                const m = /^([^,]*),\s*(.+)/.exec(name);
                if (m) {
                    sql += ' AND v.firstname LIKE ?';
                    values.push(m[2] + '%');
                    name = m[1];
                    explanation += 'First name: ' + m[2] + '*\n';
                }
                if (name) {
                    name = name.replace(/\s*,\s*$/, '');
                    sql += ' AND v.lastname LIKE ?';
                    values.push(name + '%');
                    explanation += 'Last name: ' + name + '*\n';
                }
            }
            if (address) {
                const m = /^(\d+)\s+(.+)/.exec(address);
                if (m) {
                    sql += ' AND v.res_house = ?';
                    values.push(m[1]);
                    address = m[2];
                    explanation += 'House number: ' + m[1] + '\n';
                }
                sql += ' AND v.res_street LIKE ?';
                values.push(address + '%');
                explanation += 'Street name: ' + address + '*\n';
            }
            if (voterId) {
                sql += ' AND v.voter_id = ?';
                values.push(voterId);
                explanation += 'Voter ID: ' + voterId + '\n';
            }
            if (match) {
                sql += ' AND ' + match + ' ORDER BY score DESC';
                values.push(q);
            }
            else {
                sql += ' ORDER BY v.lastname, v.firstname, v.middle, v.suffix';
            }
            sql += ' LIMIT ' + limit;
            db.query(sql, values, function (err, results) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                explanation = results.length +
                    (results.length < limit ? '' : ' or more') +
                    ' record' + (results.length === 1 ? '' : 's') + '\n' +
                    explanation;
                res.set('Cache-Control', 'max-age=600'); // cache for 10 min
                res.json({
                    explanation: explanation,
                    results: results,
                });
            });
        },

        lineRead: function (req, res) {
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

        lineUpdate: function (req, res) {
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
                function (err, result) {
                    if (err) {
                        console.error(err);
                        res.sendStatus(500);
                        return;
                    }
                    db.query(
                        'SELECT * FROM petition_lines WHERE id = ?',
                        [id],
                        function (err, rows) {
                            const lineData = rows[0];
                            if (lineData.date_signed) {
                                lineData.date_signed = moment(lineData.date_signed)
                                    .utc().format('MM/DD/YYYY');
                            }
                            res.json(lineData);
                        }
                    );
                }
            );
        },

        status: function (req, res) {
            const project = req.project || (req.user ? req.user.projects[0] : null);
            const responseData = {
                user: req.user || {},
                project: project,
                complete: 0,
                incomplete: 0,
                overall: {
                    complete: 0,
                    incomplete: 0,
                },
                version: pkg.version,
            };
            let currentPage;
            let currentLine;
            if (!project) {
                res.json(responseData);
                return;
            }
            async.series(
                [
                    function getCurrentLine(callback) {
                        const sql = 'SELECT page, line FROM petition_lines ' +
                            "WHERE project_id = ? AND checker = ? AND finding NOT IN ('', 'V') " +
                            'ORDER BY page DESC, line DESC LIMIT 1';
                        db.query(sql, [project.id, req.user.username], function (err, rows) {
                            if (err) {
                                return callback(err);
                            }
                            if (rows.length) {
                                currentPage = rows[0].page;
                                currentLine = rows[0].line;
                            }
                            return callback(null);
                        });
                    },
                    function getNextLine(callback) {
                        const sql = 'SELECT * FROM petition_lines WHERE project_id = ? AND checker = ? ' +
                            "AND finding = '' " +
                            'ORDER BY page, line LIMIT 1';
                        db.query(sql, [project.id, req.user.username], function (err, rows) {
                            if (err) {
                                return callback(err);
                            }
                            responseData.lineRecord = rows[0] || null;
                            return callback(null);
                        });
                    },
                    function getUserProgress(callback) {
                        const sql = "SELECT IF(finding IN ('', 'S'), 'incomplete', 'complete') AS state, " +
                            'COUNT(*) AS `count` FROM petition_lines ' +
                            'WHERE project_id = ? AND checker = ? GROUP BY state';
                        db.query(sql, [project.id, req.user.username], function (err, rows) {
                            if (err) {
                                return callback(err);
                            }
                            rows.forEach(function (row) {
                                responseData[row.state] = +row.count;
                            });
                            return callback(null);
                        });
                    },
                    function getOverallProgress(callback) {
                        const sql = "SELECT IF(finding IN ('', 'S'), 'incomplete', 'complete') AS state, " +
                            'COUNT(*) AS `count` FROM petition_lines ' +
                            'WHERE project_id = ? GROUP BY state';
                        db.query(sql, [project.id], function (err, rows) {
                            if (err) {
                                return callback(err);
                            }
                            rows.forEach(function (row) {
                                responseData.overall[row.state] = +row.count;
                            });
                            res.json(responseData);
                            return callback(null);
                        });
                    },
                ],
                function (err, results) {
                    if (err) {
                        console.error(err);
                        res.sendStatus(500);
                    }
                }
            );
        },

        markBlank: function (req, res) {
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
                res.json({results: results});
            });
        },

        completedTsv: function (req, res) {
            let sql = 'SELECT l.*, c.name AS circulator_name';
            if (!req.project) {
                res.sendStatus(404);
                return;
            }
            if (config.party) {
                sql += ', v.party';
            }
            sql += ' FROM petition_lines l LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ' +
                'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
                'LEFT JOIN voters v ON l.voter_id = v.voter_id ' +
                "WHERE l.project_id = ? AND l.finding <> '' ORDER BY page, line";
            sendTsv(req, res, sql, [req.project.id]);
        },

        // Return line data in DataTables format
        dtLine: function (req, res) {
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

        getCirculator: function (req, res) {
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

        getCirculators: function (req, res) {
            /* @todo Handle connection of circulators to projects */
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

        getPage: function (req, res) {
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

        getPages: function (req, res) {
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

        getUser: function (req, res) {
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

        getUsers: function (req, res) {
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

        getTotals: function (req, res) {
            let sql = "SELECT (CASE WHEN c.status = '' THEN l.finding ELSE c.status END) AS combinedFinding, " +
                'COUNT(*) AS count FROM petition_lines l ' +
                'LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ' +
                'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
                'WHERE l.project_id = ? ';
            const values = [req.project.id];
            const circulatorId = +req.query.circulator;
            if (circulatorId) {
                sql += 'AND p.circulator_id = ? ';
                values.push(circulatorId);
            }
            sql += 'GROUP BY combinedFinding';
            db.query(sql, values, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                const totals = {};
                const wardBreakdown = {};
                rows.forEach(function (row) {
                    totals[row.combinedFinding] = +row.count;
                });
                db.query(
                    // WHERE is because of bad data in BOE database (2 records with no ward)
                    'SELECT ward, COUNT(*) as registered FROM voters WHERE ward > 0 GROUP BY ward',
                    function (err, rows) {
                        let totalRegistered = 0;
                        if (err) {
                            console.error(err);
                            res.sendStatus(500);
                            return;
                        }
                        rows.forEach(function (row) {
                            wardBreakdown[row.ward] = {
                                signers: 0,
                                registered: row.registered,
                            };
                            totalRegistered += row.registered;
                        });
                        wardBreakdown.TOTAL = {
                            signers: 0,
                            registered: totalRegistered,
                        };
                        let sql = 'SELECT l.ward, COUNT(*) AS count FROM petition_lines l ';
                        if (circulatorId) {
                            sql += 'INNER JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ';
                        }
                        sql += "WHERE l.finding = 'OK' AND l.project_id = ? ";
                        const values = [req.project.id];
                        if (circulatorId) {
                            sql += 'AND p.circulator_id = ? ';
                            values.push(circulatorId);
                        }
                        sql += 'GROUP BY l.ward';
                        db.query(sql, values, function (err, rows) {
                            if (err) {
                                console.error(err);
                                res.sendStatus(500);
                                return;
                            }
                            rows.forEach(function (row) {
                                if (wardBreakdown[row.ward]) {
                                    wardBreakdown[row.ward].signers = row.count;
                                    wardBreakdown.TOTAL.signers += row.count;
                                }
                            });
                            res.json({totals: totals, wardBreakdown: wardBreakdown});
                        });
                    }
                );
            });
        },

        createOrUpdateCirculator: function (req, res) {
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
                        res.json(rows[0]);
                    }
                );
            });
        },

        deleteCirculator: function (req, res) {
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
                        function (err, rows) {
                            res.sendStatus(204);
                        }
                    );
                }
            );
        },

        createOrUpdatePage: function (req, res) {
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
            db.query(sql, values, function (err, result) {
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
                db.query(sql, function (err, result) {
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

        createOrUpdateUser: function (req, res) {
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
                    function (err, rows) {
                        if (err) {
                            console.log('user SQL error', err);
                            res.sendStatus(500);
                            return;
                        }
                        db.query(
                            'SELECT * FROM users WHERE id = ?',
                            [id],
                            function (err, rows) {
                                res.json(rows[0]);
                            }
                        );

                    }
                );
            });
        },

        assignPages: function (req, res) {
            const username = req.params.username;
            const pages = req.body;
            if (!Array.isArray(pages) || pages.filter(v => !/^\d+$/.test(v)).length) {
                res.sendStatus(400);
                return;
            }
            db.query(
                'UPDATE petition_lines SET checker = ? WHERE project_id = ? AND page IN (?)',
                [username, req.project.id, pages],
                function (err, result) {
                    if (err) {
                        console.error(err);
                        res.sendStatus(500);
                        return;
                    }
                    res.sendStatus(204);
                }
            );
        },

        sendToken: function (req, res) {
            res.json({sent: true});
        },

        challenge: function (req, res) {
            if (!req.project) {
                res.sendStatus(404);
                return;
            }
            let sql = 'SELECT l.*, c.status as circulator_status, c.name as circulator_name, ' +
                'c.notes AS circulator_notes ' +
                'FROM petition_lines l LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ' +
                'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
                'WHERE l.project_id = ?';
            const values = [req.project.id];
            if (req.query.p) {
                sql += ' AND l.page in (?)';
                values.push(NumberList.parse(req.query.p));
            }
            sql += ' ORDER BY l.page, l.line';
            db.query(sql, values, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                const regulations = {
                    A: '1607.1(b) not registered at address',
                    NM: '1607.1(b) not registered at address',
                    NR: '1607.1(b) not registered at address',
                    I: '1607.1(f) illegible',
                    MA: '1607.1(e) no address',
                    MD: '1607.1(d) no date',
                    MS: '1607.1(i) signature not made by person purported',
                    WP: '1607.1(n) wrong party',
                    WW: '1607.1(m) wrong ward',
                    D: '1607.1(c)',
                    CU: '1607.1(g) circulator not qualified',
                    CA: '1607.1(h) circulator affidavit defective',
                };
                const circulators = {};
                const data = {};
                _.forEach(rows, function (row) {
                    if (!data[row.page]) {
                        data[row.page] = [];
                    }
                    let signer = '';
                    let explanation = '';
                    let circulatorExplanation = '';
                    if (!circulators[row.page]) {
                        if (row.circulator_status) {
                            circulatorExplanation =
                                config.circulatorStatuses[row.circulator_status] || row.circulator_status;
                        }
                        if (row.circulator_notes) {
                            if (circulatorExplanation) {
                                circulatorExplanation += '; ';
                            }
                        }
                        circulators[row.page] = {
                            name: row.circulator_name,
                            explanation: circulatorExplanation,
                        };
                    }
                    if (row.circulator_status === 'CU') {
                        explanation = regulations.CU;
                    }
                    if (['', 'S', 'OK'].indexOf(row.finding) === -1) {
                        signer = row.voter_name || '';
                        if (row.address) {
                            if (signer) {
                                signer += '<br>';
                            }
                            signer += row.address;
                        }
                        if (row.finding === 'B') {
                            signer = '(blank)';
                        }
                        else { // if (row.finding !== 'D') { // "Duplicate" is already in the notes
                            if (explanation) {
                                explanation += '; ';
                            }
                            // explanation = config.findingCodes[row.finding] || row.finding;
                            explanation += regulations[row.finding] || row.finding;
                        }
                        let m;
                        if (row.notes && (m = row.notes.match(/(Duplicate of page \d+, line \d+)/))) {
                            explanation += '; ' + (/1607\.1\(c\)/.test(explanation) ? '' : '1607.1(c) ') +
                                m[1].replace('Duplicate', 'duplicate')
                                    .replace(
                                        /(duplicate of page )(\d+)/g,
                                        function (match, p1, p2) {
                                            return p1 + (+p2 < 300 ? p2 : p2 - 299) + ' of ' + (+p2 < 300 ? 299 : 37);
                                        }
                                    );
                        }
                    }
                    data[row.page][row.line - 1] = {
                        signer: signer,
                        explanation: explanation,
                    };
                });
                res.send(challengeTemplate({
                    challengeHeader: config.challengeHeader,
                    circulators: circulators,
                    data: data,
                }));
            });
        },
    };
};
