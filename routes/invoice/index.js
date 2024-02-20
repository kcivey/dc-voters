const fs = require('fs');
const createError = require('http-errors');
const db = require('../../lib/db');
const _ = require('underscore');
const invoiceTemplate = _.template(
    fs.readFileSync(__dirname + '/invoice.html', {encoding: 'utf8'})
        .replace(/^\s+/gm, '')
);

module.exports = {

    createOrUpdateInvoice(req, res, next) {
        if (!req.project.paidCirculators) {
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
        if (!req.project.paidCirculators) {
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
        if (!req.project.paidCirculators) {
            throw createError(404, 'No invoices for this project');
        }
        db.getInvoices(req.project.id)
            .then(rows => res.json(rows))
            .catch(next);
    },

    deleteInvoice(req, res, next) {
        if (!req.project.paidCirculators) {
            throw createError(404, 'No invoices for this project');
        }
        db.deleteInvoice(req.project.id, +req.params.number)
            .then(function (affectedRows) {
                if (!affectedRows) {
                    throw createError(404, 'No such invoice');
                }
                res.sendStatus(204);
            })
            .catch(next);
    },

    async htmlInvoices(req, res) {
        const project = req.project;
        if (!project.paidCirculators) {
            throw createError(404, 'No invoices for this project');
        }
        let invoiceNumbers;
        if (req.params.number) {
            invoiceNumbers = [+req.params.number];
        }
        else {
            invoiceNumbers = await db.getInvoiceNumbersToPrint(project.id);
        }
        const invoices = [];
        for (const n of invoiceNumbers) {
            const invoice = await db.getInvoice(project.id, n);
            invoice.circulator = await db.getCirculator(project.id, invoice.circulator_id);
            invoice.pages = await db.getPages({projectId: project.id, criteria: {invoice_id: invoice.id}});
            invoice.valid_lines = invoice.pages.reduce((a, c) => a + +c.valid_lines, 0);
            invoices.push(invoice);
        }
        res.send(invoiceTemplate({project, invoices, formatDate}));

        function formatDate(date) {
            return date ? date.replace(/(\d{4})-(\d\d)-(\d\d)/, '$2/$3/$1') : '';
        }
    },

};
