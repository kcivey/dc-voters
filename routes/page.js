const db = require('../lib/db');

module.exports = {

    assignPages(req, res) {
        const pages = req.body;
        if (!Array.isArray(pages) || pages.filter(v => !/^\d+$/.test(v)).length) {
            res.sendStatus(400);
            return;
        }
        db.assignPages(req.project.id, req.params.username, pages)
            .then(() => res.sendStatus(204))
            .catch(function (err) {
                console.error(err);
                res.sendStatus(500);
            });
    },

    createOrUpdatePage(req, res) {
        const projectId = req.project.id;
        const data = req.body;
        const number = +req.params.number;
        const id = data.id;
        db.createOrUpdatePage({projectId, data, number, id})
            .then(page => res.json(page))
            .catch(function (err) {
                console.error(err);
                res.sendStatus(500);
            });
    },

    getPage(req, res) {
        db.getPage(req.project.id, +req.params.number)
            .then(function (page) {
                if (page) {
                    res.json(page);
                }
                else {
                    res.sendStatus(404);
                }
            })
            .catch(function (err) {
                console.error(err);
                res.sendStatus(500);
            });
    },

    getPages(req, res) {
        db.getPages(req.project.id)
            .then(rows => res.json(rows))
            .catch(function (err) {
                console.error(err);
                res.sendStatus(500);
            });
    },

};
