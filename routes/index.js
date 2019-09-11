const async = require('async');
const config = require('../public/config.json');
const db = require('../lib/db');
const pkg = require('../package.json');
const authentication = require('../authentication');
const circulatorRoutes = require('./circulator');
const lineRoutes = require('./line');
const pageRoutes = require('./page');
const tsvRoutes = require('./tsv');
const userRoutes = require('./user');

module.exports = function (/* app */) {

    return {

        search(req, res) {
            const options = req.query;
            db.searchForVoter(options, function (err, results) {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }
                res.set('Cache-Control', 'max-age=600'); // cache for 10 min
                return res.json(results);
            });
        },

        status(req, res) {
            const project = req.project || (req.user ? req.user.projects[0] : null);
            const status = {
                user: req.user || {},
                project,
                complete: 0,
                incomplete: 0,
                version: pkg.version,
            };
            if (!project) {
                res.json(status);
                return;
            }
            db.getStatus(project.id, req.user.username, function (err, partialStatus) {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }
                Object.assign(status, partialStatus);
                return res.json(status);
            });
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
