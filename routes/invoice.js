const createError = require('http-errors');
const db = require('../lib/db');

module.exports = {

    createOrUpdateInvoice(req, res, next) {
        const projectId = req.project.id;
        const number = +req.params.number;
        const data = req.body;
        db.createOrUpdateInvoice({projectId, number, data})
            .then(invoice => res.json(invoice))
            .catch(next);
    },

    getInvoice(req, res, next) {
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
        db.getInvoices(req.project.id)
            .then(rows => res.json(rows))
            .catch(next);
    },

};
