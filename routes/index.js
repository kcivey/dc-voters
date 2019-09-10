const async = require('async');
const config = require('../public/config.json');
const db = require('../lib/db');
const pkg = require('../package.json');
const authentication = require('./authentication');
const circulatorRoutes = require('./circulator');
const lineRoutes = require('./line');
const pageRoutes = require('./page');
const tsvRoutes = require('./tsv');
const userRoutes = require('./user');

module.exports = function (/* app */) {

    return {

        search(req, res) {
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
                res.json({explanation, results});
            });
        },

        status(req, res) {
            const project = req.project || (req.user ? req.user.projects[0] : null);
            const responseData = {
                user: req.user || {},
                project,
                complete: 0,
                incomplete: 0,
                version: pkg.version,
            };
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
                        db.query(sql, [project.id, req.user.username], err => callback(err || null));
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
                    function returnResponse(callback) {
                        res.json(responseData);
                        return callback(null);
                    },
                ],
                function (err) {
                    if (err) {
                        console.error(err);
                        res.sendStatus(500);
                    }
                }
            );
        },

        getTotals(req, res) {
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
                            res.json({totals, wardBreakdown});
                        });
                    }
                );
            });
        },

        ...circulatorRoutes,
        ...lineRoutes,
        ...pageRoutes,
        ...tsvRoutes,
        ...userRoutes,

        authentication,

    };

};
