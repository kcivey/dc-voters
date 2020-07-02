const createError = require('http-errors');
const db = require('../lib/db');
const {getDtParams} = require('../lib/datatables');

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

    // Return page data in DataTables format
    async dtPages(req, res, next) {
        const projectId = req.project.id;
        const {criteria, search, start, length, order, draw} = getDtParams(req.query);
        const output = {draw};
        order.push('number'); // sort by page if nothing else
        try {
            output.recordsTotal = await db.getPageCount(projectId);
            output.recordsFiltered = await db.getPageCount(projectId, criteria, search);
            output.data = await db.getPages({projectId, criteria, search, start, length, order});
            res.json(output);
        }
        catch (err) {
            next(err); // eslint-disable-line callback-return
        }
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
        db.getPages({projectId: req.project.id})
            .then(rows => res.json(rows))
            .catch(next);
    },

};
