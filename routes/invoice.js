const createError = require('http-errors');
const moment = require('moment');
const numberList = require('number-list');
const db = require('../lib/db');

module.exports = {

    createInvoices(req, res, next) {
        if (!req.project.paid_circulators) {
            throw createError(404, 'No invoices for this project');
        }
        const project = req.project;
        const date = +req.params.date;
        const mDate = moment(date, 'YYYY-MM-DD');
        if (!/^\d{4}-\d\d-\d\d$/.test(date) || !mDate.isValid()) {
            throw createError(400, 'Invalid date');
        }
        db.createInvoices(project, date)
            .then(numbers => res.json({created: numberList.stringify(numbers)}))
            .catch(next);
    },

    createOrUpdateInvoice(req, res, next) {
        if (!req.project.paid_circulators) {
            throw createError(404, 'No invoices for this project');
        }
        const projectId = req.project.id;
        const number = +req.params.number;
        const data = req.body;
        db.createOrUpdateInvoice({projectId, number, data})
            .then(invoice => res.json(invoice))
            .catch(next);
    },

    getInvoice(req, res, next) {
        if (!req.project.paid_circulators) {
            throw createError(404, 'No invoices for this project');
        }
        db.getInvoice(req.project.id, +req.params.number)
            .then(function (invoice) {
                if (!invoice) {
                    throw createError(404, 'No such invoice');
                }
                res.json(invoice);
            })
            .catch(next);
    },

    getInvoices(req, res, next) {
        if (!req.project.paid_circulators) {
            throw createError(404, 'No invoices for this project');
        }
        db.getInvoices(req.project.id)
            .then(rows => res.json(rows))
            .catch(next);
    },

};
