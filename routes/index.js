module.exports = function (app) {
    var _ = require('underscore'),
        moment = require('moment'),
        async = require('async'),
        passwordHash = require('password-hash'),
        db = require('../db'),
        pkg = require('../package.json'),
        dcGisProxy = require('http-proxy').createProxyServer({target: 'http://citizenatlas.dc.gov'});

    function sendTsv(req, res, sql, values) {
        var filename, m;
        if (m = req.path.match(/([^\/]+)$/)) {
            filename = m[1];
        }
        else {
            filename = 'data.tsv';
        }
        db.query(sql, values, function (err, rows, fields) {
            var fieldNames = _.pluck(fields, 'name'),
                content = fieldNames.join('\t') + '\n';
            _.forEach(rows, function (row) {
                content += _.map(fieldNames, function (name) {
                    if (name == 'check_time' && row.check_time) {
                        return moment(row.check_time).format('YYYY-MM-DD HH:mm:ss');
                    }
                    if (name == 'date_signed' && row.date_signed) {
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
            var q = req.query.q,
                name = req.query.name,
                address = req.query.address,
                voterId = req.query.voter_id,
                values = [],
                limit = 10,
                explanation = '',
                match, sql, m;
            if (q) {
                match = 'MATCH (firstname, lastname, res_house, res_street) AGAINST (? IN BOOLEAN MODE)';
                explanation += 'General query: ' + q + '\n';
            }
            sql = 'SELECT registered, lastname, firstname, middle, suffix, status, res_house, res_frac, res_apt, res_street, ward, voter_id';
            if (match) {
                sql += ', ' + match + ' AS score';
                values.push(q);
            }
            sql += ' FROM voters WHERE 1';
            if (name) {
                if (m = /^([^,]*),\s*(.+)/.exec(name)) {
                    sql += ' AND firstname LIKE ?';
                    values.push(m[2] + '%');
                    name = m[1];
                    explanation += 'First name: ' + m[2] + '*\n';
                }
                if (name) {
                    name = name.replace(/\s*,\s*$/, '');
                    sql += ' AND lastname LIKE ?';
                    values.push(name + '%');
                    explanation += 'Last name: ' + name + '*\n';
                }
            }
            if (address) {
                if (m = /^(\d+)\s+(.+)/.exec(address)) {
                    sql += ' AND res_house = ?';
                    values.push(m[1]);
                    address = m[2];
                    explanation += 'House number: ' + m[1] + '\n';
                }
                sql += ' AND res_street LIKE ?';
                values.push(address + '%');
                explanation += 'Street name: ' + address + '*\n';
            }
            if (voterId) {
                sql += ' AND voter_id = ?';
                values.push(voterId);
                explanation += 'Voter ID: ' + voterId + '\n';
            }
            if (match) {
                sql += ' AND ' + match + ' ORDER BY score DESC';
                values.push(q);
            }
            else {
                sql += ' ORDER BY lastname, firstname, middle, suffix';
            }
            sql += ' LIMIT ' + limit;
            console.log(sql);
            console.log(values);
            db.query(sql, values, function (err, results) {
                if (err) {
                    throw err;
                }
                explanation = results.length +
                    (results.length < limit ? '' : ' or more') +
                    ' record' + (results.length == 1 ? '' : 's') +  '\n' +
                    explanation;
                res.json({
                    explanation: explanation,
                    results: results
                });
            });
        },

        findLocation: function (req, res) {
            req.headers.host = 'citizenatlas.dc.gov';
            req.url = '/newwebservices/locationverifier.asmx' + req.url;
            dcGisProxy.web(req, res);
        },

        lineRead: function (req, res) {
            var id = +req.param('id'),
                page = +req.param('page'),
                line = +req.param('line'),
                sql = 'SELECT * FROM petition_lines WHERE ',
                values = [];
            if (id) {
                sql += "id = ?";
                values.push(id);
            }
            else {
                sql += "page = ? AND line = ?";
                values.push(page, line);
            }
            sql += ' LIMIT 1';
            db.query(sql, values, function (err, rows) {
                if (err) {
                    throw err;
                }
                if (rows.length) {
                    res.json(rows[0]);
                }
                else {
                    res.send(404);
                }
            });
        },

        lineUpdate: function (req, res) {
            var id = +req.param('id'),
                lineData = req.body;
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
                        throw err;
                    }
                    db.query(
                        'SELECT * FROM petition_lines WHERE id = ?',
                        [id],
                        function (err, rows) {
                            lineData = rows[0];
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
            var responseData = {
                    user: req.user || {},
                    complete: 0,
                    incomplete: 0,
                    overall: {
                        complete: 0,
                        incomplete: 0
                    },
                    version: pkg.version
                },
                currentPage, currentLine;
            async.series([
                function getCurrentLine(callback) {
                    var sql = "SELECT page, line FROM petition_lines WHERE checker = ? AND finding NOT IN ('', 'V')" +
                        " ORDER BY page DESC, line DESC LIMIT 1";
                    db.query(sql, [req.user.username], function (err, rows) {
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
                    var sql = "SELECT * FROM petition_lines WHERE checker = ? AND finding = ''" +
                        " ORDER BY page, line LIMIT 1";
                    db.query(sql, [req.user.username], function (err, rows) {
                        if (err) {
                            return callback(err);
                        }
                        responseData.lineRecord = rows[0] || null;
                        return callback(null);
                    });
                },
                function getUserProgress(callback) {
                    var sql = "SELECT IF(finding IN ('', 'S'), 'incomplete', 'complete') AS state, COUNT(*) AS `count` " +
                        'FROM petition_lines WHERE checker = ? GROUP BY state';
                    db.query(sql, [req.user.username], function (err, rows) {
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
                    var sql = "SELECT IF(finding IN ('', 'S'), 'incomplete', 'complete') AS state, COUNT(*) AS `count` " +
                        'FROM petition_lines GROUP BY state';
                    db.query(sql, function (err, rows) {
                        if (err) {
                            return callback(err);
                        }
                        rows.forEach(function (row) {
                            responseData.overall[row.state] = +row.count;
                        });
                        res.json(responseData);
                        return callback(null);
                    });
                }],
                function (err, results) {
                    if (err) {
                        throw err;
                    }
                }
            );
        },

        markBlank: function (req, res) {
            var page = +req.param('page'),
                line = req.param('line'),
                sql = "UPDATE petition_lines SET ? WHERE checker = ? AND page = ? AND line ",
                values = [
                    {finding: 'B', checker: req.user.username, check_time: new Date()},
                    req.user.username,
                    page
                ],
                m = line.match(/^(\d+)-(\d+)$/);
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
                    throw err;
                }
                res.json({results: results});
            });
        },

        completedTsv: function (req, res) {
            var sql = "SELECT * FROM petition_lines WHERE finding <> '' ORDER BY page, line";
            sendTsv(req, res, sql, []);
        },

        dtLine: function (req, res) {
            var start = +req.param('iDisplayStart') || 0,
                length = +req.param('iDisplayLength') || 100,
                data = {sEcho: +req.param('sEcho') || 1},
                search = req.param('sSearch'),
                sortingCols = +req.param('iSortingCols') || 0,
                checker = req.param('checker'),
                filterColumn = req.param('filterColumn') || '',
                filterValue = req.param('filterValue'),
                table = 'petition_lines',
                sql = 'SELECT COUNT(*) AS `count` FROM ' + table,
                where = " WHERE finding <> ''",
                order = [],
                values = [],
                i, sortColumnIndex, sortColumn, sortDirection;
            db.query(sql, function (err, rows) {
                if (err) {
                    throw err;
                }
                data.iTotalRecords = +rows[0].count;
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
                        throw err;
                    }
                    data.iTotalDisplayRecords = +rows[0].count;
                    sql = 'SELECT * FROM ' + table + where;
                    if (search) {
                        search = '%' + search + '%';
                        sql += ' AND (0';
                        ['voter_name', 'address'].forEach(function (column) {
                            sql += ' OR ' + column + ' LIKE ?';
                            values.push(search);
                        });
                        sql += ')';
                    }
                    for (i = 0; i < sortingCols; i++) {
                        sortColumnIndex = +req.param('iSortCol_' + i) || 0;
                        sortColumn = req.param('mDataProp_' + sortColumnIndex);
                        if (/^\w+$/.test(sortColumn) && sortColumn != 'function') {
                            sortDirection = req.param('sSortDir_' + i);
                            order.push(sortColumn + (sortDirection == 'desc' ? ' DESC' : ''));
                        }
                    }
                    order.push('check_time DESC', 'id DESC'); // sort newest first if nothing else
                    sql += ' ORDER BY ' + order.join(', ');
                    sql += ' LIMIT ' + start + ',' + length;
                    db.query(sql, values, function (err, rows) {
                        if (err) {
                            throw err;
                        }
                        data.aaData = rows;
                        res.json(data);
                    });
                });
            });
        },

        getUsers: function (req, res) {
            var sql = 'SELECT u.id, u.username, u.email, u.admin, COUNT(DISTINCT l.page) AS pages ' +
                    'FROM users u LEFT JOIN petition_lines l ON u.username = l.checker ' +
                    'GROUP BY u.username ORDER BY u.username';
            db.query(sql, function (err, rows) {
                if (err) {
                    throw err;
                }
                res.json(rows);
            });
        },

        createOrUpdateUser: function (req, res) {
            var id = +req.param('id'),
                userData = req.body,
                values = [userData],
                sql;
            if (id) {
                delete userData.id;
                sql = 'UPDATE users SET ? WHERE id = ?';
                values.push(id);
            }
            else {
                if (!userData.username || !userData.password) {
                    res.send(400);
                    return;
                }
                sql = 'INSERT INTO users SET ?';
            }
            if (userData.password) {
                userData.password = passwordHash.generate(userData.password);
            }
            db.query(sql, values, function (err, result) {
                if (err) {
                    console.log('user SQL error', err);
                    res.send(500);
                    return;
                }
                if (result.insertId) {
                    id = result.insertId;
                }
                if (!id) {
                    res.send(500);
                    return;
                }
                db.query(
                    'SELECT * FROM users WHERE id = ?',
                    [id],
                    function (err, rows) {
                        res.json(rows[0]);
                    }
                );
            });
        },

        assignPages: function (res, req) {
            var username = +req.param('username'),
                pages = req.body;
            if (!Array.isArray(pages) || pages.filter(function (v) { return !/^\d+$/.test(v); }).length) {
                res.send(400);
                return;
            }
            db.query(
                'UPDATE petition_lines SET checker = ? WHERE page IN (?)',
                [username, pages],
                function (err, result) {
                    res.send(204);
                }
            )
        }
    };
};
