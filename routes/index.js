const db = require('../lib/db');
const pkg = require('../package.json');
const authentication = require('./authentication');
const circulatorRoutes = require('./circulator');
const lineRoutes = require('./line');
const pageRoutes = require('./page');
const tsvRoutes = require('./tsv');
const userRoutes = require('./user');
const challenge = require('./challenge');

module.exports = function (/* app */) {

    return {

        search(req, res) {
            const options = req.query;
            db.searchForVoter(options)
                .then(function (results) {
                    res.set('Cache-Control', 'max-age=600'); // cache for 10 min
                    res.json(results);
                })
                .catch(function (err) {
                    console.error(err);
                    res.sendStatus(500);
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
            db.getStatus(project.id, req.user.username)
                .then(function (partialStatus) {
                    Object.assign(status, partialStatus);
                    return res.json(status);
                })
                .catch(function (err) {
                    console.error(err);
                    res.sendStatus(500);
                });
        },

        getTotals(req, res) {
            db.getTotals(req.project.id, +req.query.circulator)
                .then(results => res.json(results))
                .catch(function (err) {
                    console.error(err);
                    res.sendStatus(500);
                });
        },

        challenge,

        ...circulatorRoutes,
        ...lineRoutes,
        ...pageRoutes,
        ...tsvRoutes,
        ...userRoutes,

        authentication,

    };

};
