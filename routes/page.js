const createError = require('http-errors');
const db = require('../lib/db');

module.exports = {

    assignPages(req, res, next) {
        const pages = req.body;
        if (!Array.isArray(pages) || pages.filter(v => !/^\d+$/.test(v)).length) {
            throw createError(400, 'Invalid pages');
        }
        db.assignPages(req.project.id, req.params.username, pages)
            .then(() => res.sendStatus(204))
            .catch(next);
    },

    createOrUpdatePage(req, res, next) {
        const project = req.project;
        const data = req.body;
        const number = req.params.number;
        const id = data.id;
        const checker = data.checker;
        delete data.checker;
        db.createOrUpdatePage({project, data, number, id, checker})
            .then(page => res.json(page))
            .catch(next);
    },

    getPage(req, res, next) {
        db.getPage(req.project.id, +req.params.number)
            .then(function (page) {
                if (!page) {
                    throw createError(404, 'No such page');
                }
                res.json(page);
            })
            .catch(next);
    },

    getPages(req, res, next) {
        db.getPages(req.project.id)
            .then(rows => res.json(rows))
            .catch(next);
    },

};
