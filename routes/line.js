const createError = require('http-errors');
const moment = require('moment');
const db = require('../lib/db');
const {getDtParams} = require('../lib/datatables');

module.exports = {

    // Return line data in DataTables format
    async dtLine(req, res, next) {
        const projectId = req.project.id;
        const {criteria, search, start, length, order, draw} = getDtParams(req.query);
        const output = {draw};
        const checker = req.query.checker || req.params.checker;
        if (checker) {
            criteria.checker = checker;
        }
        order.push('check_time DESC', 'id DESC'); // sort newest first if nothing else
        try {
            output.recordsTotal = await db.getProcessedLineCount(projectId);
            output.recordsFiltered = await db.getProcessedLineCount(projectId, criteria, search);
            output.data = await db.getProcessedLines({projectId, criteria, search, start, length, order});
            res.json(output);
        }
        catch (err) {
            next(err); // eslint-disable-line callback-return
        }
    },

    getLine(req, res, next) {
        const projectId = [req.project.id];
        const id = +req.params.id;
        const page = +req.params.page;
        const line = +req.params.line;
        db.getLine({projectId, id, page, line})
            .then(function (line) {
                if (!line) {
                    throw createError(404, 'No such line');
                }
                res.json(line);
            })
            .catch(next);
    },

    markLineBlank(req, res, next) {
        const projectId = req.project.id;
        const page = +req.params.page;
        const line = req.params.line;
        const updates = {
            finding: 'B',
            checker: req.user.username,
            check_time: new Date(),
        };
        db.updateLineOrRange({projectId, page, line, updates})
            .then(lineData => res.json(lineData))
            .catch(next);
    },

    updateLine(req, res, next) {
        const projectId = req.project.id;
        const id = +req.params.id;
        const updates = req.body;
        delete updates.id;
        updates.check_time = new Date();
        if (updates.date_signed) {
            updates.date_signed = updates.date_signed
                .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
        }
        db.updateLineOrRange({projectId, id, updates})
            .then(function (line) {
                if (line.date_signed) {
                    line.date_signed = moment(line.date_signed)
                        .utc()
                        .format('MM/DD/YYYY');
                }
                return res.json(line);
            })
            .catch(next);
    },

};
