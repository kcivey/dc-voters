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
            db.getTotals(req.project.id, +req.query.circulator, function (err, results) {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }
                return res.json(results);
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
