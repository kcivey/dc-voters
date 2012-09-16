module.exports = function (app) {
    var _ = require('underscore'),
        db = require('../db'),
        httpProxy = require('http-proxy'),
        dcGisProxy = new httpProxy.HttpProxy({target: {host: 'citizenatlas.dc.gov', port: 80}});
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
            dcGisProxy.proxyRequest(req, res);
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
                            res.json(rows[0]);
                        }
                    );
                }
            );
        },

        status: function (req, res) {
            var sql = "SELECT * FROM petition_lines WHERE dcpt_code = ''",
                values = [],
                page, line;
            if (page && line) {
                sql += ' AND (page > ? OR page = ? AND line > ?)';
                values.push(page, page, line);
            }
            sql += ' AND checker = ? ORDER BY page, line LIMIT 1';
            values.push(req.user);
            db.query(sql, values, function (err, rows) {
                var data;
                if (err) {
                    throw err;
                }
                data = {
                    user: req.user,
                    lineRecord: rows[0] || null,
                    complete: 0,
                    incomplete: 0
                };
                sql = "SELECT IF(dcpt_code = '', 'incomplete', 'complete') AS state, COUNT(*) AS `count` " +
                    'FROM petition_lines WHERE checker = ? GROUP BY state';
                db.query(sql, [req.user], function (err, rows) {
                    if (err) {
                        throw err;
                    }
                    rows.forEach(function (row) {
                        data[row.state] = +row.count;
                    });
                    res.json(data);
                });
            });
        },

        markBlank: function (req, res) {
            var page = +req.param('page'),
                line = req.param('line'),
                sql = "UPDATE petition_lines SET ? WHERE checker IN (?) AND page = ? AND line ",
                values = [
                    {dcpt_code: 'B', checker: req.user, check_time: new Date()},
                    ['', req.user],
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
            var sql = "SELECT * FROM petition_lines WHERE dcpt_code <> '' ORDER BY page, line",
                content;
            db.query(sql, function (err, rows, fields) {
                var fieldNames = _.pluck(fields, 'name');
                content = fieldNames.join("\t") + "\n";
                _.forEach(rows, function (row) {
                    content += _.map(fieldNames, function (name) { return row[name]; })
                        .join("\t") + "\n";
                });
                res.attachment('completed.tsv');
                res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
                res.send(content);
            });
        },

        dtLine: function (req, res) {
            var start = +req.param('iDisplayStart') || 0,
                length = +req.param('iDisplayLength') || 100,
                data = {sEcho: +req.param('sEcho') || 1},
                search = req.param('sSearch'),
                sortingCols = +req.param('iSortingCols') || 0,
                checker = req.param('checker'),
                table = 'petition_lines',
                sql = 'SELECT COUNT(*) AS `count` FROM ' + table,
                where = " WHERE dcpt_code <> ''",
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
        }

    };
};
