const createError = require('http-errors');
const moment = require('moment');

module.exports = function (db) {

    const {queryPromise} = db;

    db.createOrUpdateInvoice = async function ({projectId, number, data}) {
        const invoiceData = {...data}; // clone
        delete invoiceData.project_id;
        delete invoiceData.id;
        delete invoiceData.number;
        const pages = invoiceData.pages;
        delete invoiceData.pages;
        for (const prop in ['date_created', 'date_paid']) {
            if (invoiceData[prop]) {
                invoiceData[prop] = invoiceData[prop]
                    .replace(/^(\d+)\/(\d+)\/(\d+)$/, '$3-$1-$2');
            }
        }
        let sql;
        let values;
        if (number) {
            sql = 'UPDATE invoices SET ? WHERE project_id = ? AND number = ?';
            values = [invoiceData, projectId, number];
        }
        else {
            if (!invoiceData.circulator_id) {
                throw createError(400, 'Missing circulator');
            }
            if (!invoiceData.date_created) {
                invoiceData.date_created = moment().format('YYYY-MM-DD');
            }
            if (!invoiceData.notes) {
                invoiceData.notes = ''; // can't set default in table for text column
            }
            invoiceData.project_id = projectId;
            number = await db.getNextInvoiceNumber(projectId);
            invoiceData.number = number;
            sql = 'INSERT INTO invoices (??) VALUES (?)';
            values = [Object.keys(invoiceData), Object.values(invoiceData)];
        }
        await queryPromise(sql, values);
        const invoice = (await queryPromise(
            'SELECT * FROM invoices WHERE project_id = ? AND number = ?',
            [projectId, number]
        ))[0];
        if (pages) {
            await queryPromise(
                'UPDATE pages SET invoice_id = ? WHERE project_id = ? AND number IN (?)',
                [invoice.id, projectId, pages]
            );
        }
        return invoice;
    };

    db.getNextInvoiceNumber = function (projectId) {
        return queryPromise(
            'SELECT MAX(number) AS max FROM invoices WHERE project_id = ?',
            [projectId]
        )
            .then(rows => (rows[0].max || 0) + 1);
    };

    db.getInvoice = function (projectId, invoiceNumber) {
        const sql = 'SELECT * FROM invoices WHERE project_id = ? AND number = ?';
        return queryPromise(sql, [projectId, invoiceNumber])
            .then(rows => fixInvoice(rows[0]));
    };

    db.getInvoices = function (projectId) {
        const sql = 'SELECT i.*, c.name AS circulator_name ' +
            'FROM invoices i INNER JOIN circulators c ON i.circulator_id = c.id ' +
            'WHERE i.project_id = ?';
        return queryPromise(sql, [projectId])
            .then(rows => rows.map(fixInvoice));
    };

    db.deleteInvoice = async function (projectId, invoiceNumber) {
        const invoice = await db.getInvoice(projectId, invoiceNumber);
        if (!invoice) {
            throw createError(404, 'No such invoice');
        }
        await queryPromise(
            'UPDATE pages SET invoice_id = NULL WHERE project_id = ? AND invoice_id = ?',
            [projectId, invoice.id]
        );
        const results = await queryPromise(
            'DELETE FROM invoices WHERE project_id = ? AND number = ?',
            [projectId, invoiceNumber]
        );
        return results.affectedRows;
    };

    db.getInvoiceNumbersToPrint = function (projectId) {
        const sql =
            `SELECT number FROM invoices
            WHERE project_id = ? AND date_paid IS NULL
            ORDER BY number`;
        return queryPromise(sql, [projectId])
            .then(rows => rows.map(row => row.number));
    };

};

function fixInvoice(i) {
    if (i.detail) {
        i.detail = JSON.parse(i.detail);
    }
    return i;
}
