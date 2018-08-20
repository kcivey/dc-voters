module.exports = function (app) {
    var fs = require('fs'),
        _ = require('underscore'),
        moment = require('moment'),
        async = require('async'),
        passwordHash = require('password-hash'),
        config = require('../public/config.json'),
        db = require('../db'),
        pkg = require('../package.json'),
        numberList = require('../number-list'),
        challengeTemplate = _.template(fs.readFileSync(__dirname + '/challenge.html', {encoding: 'utf8'}).replace(/^\s+/gm, ''));

    function sendTsv(req, res, sql, values) {
        var filename, m;
        if (m = req.path.match(/([^\/]+)$/)) {
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
            var fieldNames = _.pluck(fields, 'name'),
                content = fieldNames.join('\t') + '\n';
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
            var q = req.query.q,
                name = req.query.name,
                address = req.query.address,
                voterId = req.query.voter_id,
                values = [],
                limit = Math.min(100, Math.max(0, Math.round(+req.query.limit))) || 10,
                explanation = '',
                match, sql, m;
            if (q) {
                match = 'MATCH (v.firstname, v.lastname, v.res_house, v.res_street) AGAINST (? IN BOOLEAN MODE)';
                explanation += 'General query: ' + q + '\n';
            }
            sql = 'SELECT v.registered, v.lastname, v.firstname, v.middle, v.suffix, v.status, v.res_house, ' +
                'v.res_frac, v.res_apt, v.res_street, v.ward, v.voter_id';
            if (config.party) {
                sql += ', v.party';
            }
            if (match) {
                sql += ', ' + match + ' AS score';
                values.push(q);
            }
            sql += ' FROM voters v WHERE 1';
            if (name) {
                if (m = /^([^,]*),\s*(.+)/.exec(name)) {
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
                if (m = /^(\d+)\s+(.+)/.exec(address)) {
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
            console.log(sql);
            console.log(values);
            db.query(sql, values, function (err, results) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                explanation = results.length +
                    (results.length < limit ? '' : ' or more') +
                    ' record' + (results.length === 1 ? '' : 's') +  '\n' +
                    explanation;
                res.set('Cache-Control', 'max-age=600'); // cache for 10 min
                res.json({
                    explanation: explanation,
                    results: results
                });
            });
        },

        lineRead: function (req, res) {
            var id = +req.params.id,
                page = +req.params.page,
                line = +req.params.line,
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
            var id = +req.params.id,
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
                        console.error(err);
                        res.sendStatus(500);
                        return;
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
                        console.error(err);
                        res.sendStatus(500);
                    }
                }
            );
        },

        markBlank: function (req, res) {
            var page = +req.params.page,
                line = req.params.line,
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
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                res.json({results: results});
            });
        },

        completedTsv: function (req, res) {
            var sql = "SELECT l.*, c.name AS circulator_name";
            if (config.party) {
                sql += ", v.party";
            }
            sql += " FROM petition_lines l LEFT JOIN pages p ON l.page = p.id " +
                "LEFT JOIN circulators c ON p.circulator_id = c.id " +
                "LEFT JOIN voters v ON l.voter_id = v.voter_id " +
                "WHERE finding <> '' ORDER BY page, line";
            sendTsv(req, res, sql, []);
        },

        dtLine: function (req, res) {
            var start = +req.query.iDisplayStart || 0,
                length = +req.query.iDisplayLength || 100,
                data = {sEcho: +req.query.sEcho || 1},
                search = req.query.sSearch,
                sortingCols = +req.query.iSortingCols || 0,
                checker = req.query.checker || req.params.checker,
                filterColumn = req.query.filterColumn || '',
                filterValue = req.query.filterValue,
                table = 'petition_lines',
                sql = 'SELECT COUNT(*) AS `count` FROM ' + table,
                where = " WHERE finding <> ''",
                order = [],
                values = [],
                i, sortColumnIndex, sortColumn, sortDirection;
            db.query(sql, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
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
                        console.error(err);
                        res.sendStatus(500);
                        return;
                    }
                    data.iTotalDisplayRecords = +rows[0].count;
                    sql = 'SELECT * FROM ' + table + where;
                    if (search) {
                        search = '%' + search + '%';
                        sql += ' AND (';
                        ['voter_name', 'address'].forEach(function (column, i) {
                            if (i > 0) {
                                sql += ' OR ';
                            }
                            sql += column + ' LIKE ?';
                            values.push(search);
                        });
                        sql += ')';
                    }
                    for (i = 0; i < sortingCols; i++) {
                        sortColumnIndex = +req.query['iSortCol_' + i] || 0;
                        sortColumn = req.query['mDataProp_' + sortColumnIndex];
                        if (/^\w+$/.test(sortColumn) && sortColumn !== 'function') {
                            sortDirection = req.query['sSortDir_' + i];
                            order.push(sortColumn + (sortDirection === 'desc' ? ' DESC' : ''));
                        }
                    }
                    order.push('check_time DESC', 'id DESC'); // sort newest first if nothing else
                    sql += ' ORDER BY ' + order.join(', ') +
                        ' LIMIT ' + start + ',' + length;
                    db.query(sql, values, function (err, rows) {
                        if (err) {
                            console.error(err);
                            res.sendStatus(500);
                            return;
                        }
                        data.aaData = rows;
                        res.json(data);
                    });
                });
            });
        },

        getCirculator: function (req, res) {
            var id = +req.params.id,
                sql = 'SELECT * FROM circulators WHERE id = ?';
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
            var sql = 'SELECT c.*, COUNT(DISTINCT p.id) AS page_count, ' +
                    "SUM(CASE WHEN l.finding NOT IN ('', 'S', 'B') THEN 1 ELSE 0 END) AS processed_lines, " +
                    "SUM(CASE WHEN l.finding = 'OK' THEN 1 ELSE 0 END) AS valid_lines " +
                    'FROM circulators c LEFT JOIN pages p ON p.circulator_id = c.id ' +
                    'LEFT JOIN petition_lines l ON p.id = l.page ' +
                    'GROUP BY c.id ORDER BY c.name';
            db.query(sql, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                res.json(rows);
            });
        },

        getPage: function (req, res) {
            var id = +req.params.id,
                sql = 'SELECT * FROM pages WHERE id = ?';
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

        getPages: function (req, res) {
            var sql = 'SELECT p.*, c.name AS circulator_name, ' +
                    "SUM(IF(l.finding IN ('', 'S'), 0, 1)) AS processed_lines, " +
                    'COUNT(l.id) AS total_lines, ' +
                    'GROUP_CONCAT(DISTINCT l.checker ORDER BY l.checker) AS checker ' +
                    'FROM pages p LEFT JOIN circulators c ON p.circulator_id = c.id ' +
                    'INNER JOIN petition_lines l ON p.id = l.page ' +
                    'GROUP BY p.id ORDER BY p.id';
            db.query(sql, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                res.json(rows);
            });
        },

        getUsers: function (req, res) {
            var sql = 'SELECT u.id, u.username, u.email, u.admin, COUNT(DISTINCT l.page) AS page_count,' +
                    'GROUP_CONCAT(DISTINCT l.page ORDER BY l.page) AS pages ' +
                    'FROM users u LEFT JOIN petition_lines l ON u.username = l.checker ' +
                    'GROUP BY u.id ORDER BY u.username';
            db.query(sql, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                rows.forEach(function (row) {
                    row.pages = row.pages ? numberList.stringify(row.pages.split(',')) : '';
                });
                res.json(rows);
            });
        },

        getTotals: function (req, res) {
            var sql = "SELECT (CASE WHEN c.status = '' THEN l.finding ELSE c.status END) AS combinedFinding, " +
                'COUNT(*) AS count FROM petition_lines l ' +
                'LEFT JOIN pages p ON l.page = p.id ' +
                'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
                'GROUP BY combinedFinding';
            db.query(sql, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                var totals = {};
                rows.forEach(function (row) {
                    totals[row.combinedFinding] = +row.count;
                });
                res.json(totals);
            });
        },

        createOrUpdateCirculator: function (req, res) {
            var table = 'circulators',
                id = +req.params.id,
                data = req.body,
                values = [data],
                sql;
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

        createOrUpdatePage: function (req, res) {
            var table = 'pages',
                id = +req.params.id,
                data = req.body,
                values = [],
                sql, ids;
            if (data.date_signed) {
                data.date_signed = data.date_signed
                    .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
            }
            if (!data.notes) {
                data.notes = '';
            }
            if (id) {
                data.id = id;
                sql = 'REPLACE INTO ' + table + ' SET ?';
                values.push(data);
                ids = [id];
            }
            else {
                if (!data.id) {
                    res.sendStatus(400);
                    return;
                }
                ids = numberList.parse(data.id);
                sql = 'INSERT INTO ' + table + ' (' + Object.keys(data).join(', ') + ') VALUES';
                ids.forEach(function (id, i) {
                    data.id = id;
                    if (i > 0) {
                        sql += ',';
                    }
                    sql += '(?)';
                    values.push(Object.values(data));
                });
                id = ids[0];
            }
            db.query(sql, values, function (err, result) {
                if (err) {
                    console.log(table + ' SQL error', err);
                    res.sendStatus(500);
                    return;
                }
                var sql = 'INSERT IGNORE INTO petition_lines (page, line) VALUES ',
                    linesPerPage = 20,
                    line;
                ids.forEach(function (id, i) {
                    if (i > 0) {
                        sql += ',';
                    }
                    for (line = 1; line <= linesPerPage; line++) {
                        if (line > 1) {
                            sql += ',';
                        }
                        sql += '(' + id + ',' + line + ')';
                    }
                });
                db.query(sql, function (err, result) {
                    if (err) {
                        console.log(table + ' SQL error', err);
                        res.sendStatus(500);
                        return;
                    }
                    db.query(
                        'SELECT * FROM ' + table + ' WHERE id = ?',
                        [id],
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
            var id = +req.params.id,
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
                    res.sendStatus(400);
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
                    'SELECT * FROM users WHERE id = ?',
                    [id],
                    function (err, rows) {
                        res.json(rows[0]);
                    }
                );
            });
        },

        assignPages: function (req, res) {
            var username = req.params.username,
                pages = req.body;
            if (!Array.isArray(pages) || pages.filter(function (v) { return !/^\d+$/.test(v); }).length) {
                res.sendStatus(400);
                return;
            }
            db.query(
                'UPDATE petition_lines SET checker = ? WHERE page IN (?)',
                [username, pages],
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

        logOut: function (req, res) {
            req.logOut();
            res.redirect('/');
        },

        challenge: function (req, res) {
            var sql = 'SELECT l.*, c.status as circulator_status, c.name as circulator_name, c.notes AS circulator_notes ' +
                    'FROM petition_lines l LEFT JOIN pages p ON l.page = p.id ' +
                    'LEFT JOIN circulators c ON p.circulator_id = c.id',
                values = [];
            if (req.query.p) {
                sql += ' WHERE l.page in (?)';
                values.push(numberList.parse(req.query.p));
            }
            sql += ' ORDER BY l.page, l.line';
            db.query(sql, values, function (err, rows) {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }
                var regulations = {
                        "A": "1607.1(b) not registered at address",
                        "NM": "1607.1(b) not registered at address",
                        "NR": "1607.1(b) not registered at address",
                        "I": "1607.1(f) illegible",
                        "MA": "1607.1(e) no address",
                        "MD": "1607.1(d) no date",
                        "MS": "1607.1(i) signature not made by person purported",
                        "WP": "1607.1(n) wrong party",
                        "WW": "1607.1(m) wrong ward",
                        "D": "1607.1(d)",
                        "CU": "1607.1(g) circulator not qualified",
                        "CA": "1607.1(h) circulator affidavit defective"
                    },
                    circulators = {},
                    data = {};
                _.forEach(rows, function (row) {
                    var signer = '',
                        explanation = '',
                        circulatorExplanation = '',
                        m;
                    if (!data[row.page]) {
                        data[row.page] = [];
                    }
                    if (!circulators[row.page]) {
                        if (row.circulator_status) {
                            circulatorExplanation = config.circulatorStatuses[row.circulator_status] || row.circulator_status;
                        }
                        if (row.circulator_notes) {
                            if (circulatorExplanation) {
                                circulatorExplanation += '; ';
                            }
                        }
                        circulators[row.page] = {
                            name: row.circulator_name,
                            explanation: circulatorExplanation
                        };
                    }
                    if (row.circulator_status === 'CU') {
                        explanation = regulations.CU;
                    }
                    if (['', 'S', 'OK'].indexOf(row.finding) == -1) {
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
                            //explanation = config.findingCodes[row.finding] || row.finding;
                            explanation += regulations[row.finding] || row.finding;
                        }
                        if (row.notes && (m = row.notes.match(/(Duplicate of page \d+, line \d+)/))) {
                            explanation += '; ' + (/1607\.1\(d\)/.test(explanation) ? '1607.1(d) ' : '') +
                                m[1].replace('Duplicate', 'duplicate')
                                    .replace(
                                        /(duplicate of page )(3\d\d)/g,
                                        function (match, p1, p2) {
                                            return p1 + (p2 - 299) + ' of 37';
                                        }
                                    );
                        }
                    }
                    data[row.page][row.line - 1] = {
                        signer: signer,
                        explanation: explanation
                    };
                });
                res.send(challengeTemplate({
                    challengeHeader: config.challengeHeader,
                    circulators: circulators,
                    data: data
                }));
            });
        }
    };
};
