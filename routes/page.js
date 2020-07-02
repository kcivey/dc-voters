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
        delete data.circulator_name;
        delete data.date_paid;
        delete data.processed_lines;
        delete data.valid_lines;
        delete data.total_lines;
        db.createOrUpdatePage({project, data, number, id, checker})
            .then(page => res.json(page))
            .catch(next);
    },

    async getPage(req, res, next) {
        const projectId = req.project.id;
        const pageNumber = +req.params.number;
        const page = await db.getPage(projectId, pageNumber);
        if (!page) {
            return next(createError(404, 'No such page'));
        }
        if (+req.query.with_lines) {
            page.lines = await db.getLinesForPage(projectId, pageNumber);
        }
        return res.json(page);
    },

    getPages(req, res, next) {
        db.getPages(req.project.id)
            .then(rows => res.json(rows))
            .catch(next);
    },

};
