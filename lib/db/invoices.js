const createError = require('http-errors');
const moment = require('moment');

module.exports = function (db) {

    const {queryPromise} = db;

    db.createOrUpdateInvoice = async function ({projectId, number, data}) {
        const invoiceData = {...data}; // clone
        delete invoiceData.project_id;
        delete invoiceData.id;
        delete invoiceData.number;
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
            if (invoiceData.hasOwnProperty('notes') && !invoiceData.notes) {
                invoiceData.notes = ''; // can't set default in table for text column
            }
            invoiceData.project_id = projectId;
            number = await db.getNextInvoiceNumber(projectId);
            invoiceData.number = number;
            sql = 'INSERT INTO invoices (??) VALUES (?)';
            values = [Object.keys(invoiceData), Object.values(invoiceData)];
        }
        await queryPromise(sql, values);
        return queryPromise(
            'SELECT * FROM invoices WHERE project_id = ? AND number = ?',
            [projectId, number]
        )
            .then(rows => rows[0]);
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
            .then(rows => rows[0]);
    };

    db.getInvoices = function (projectId) {
        const sql = 'SELECT i.*, c.name AS circulator_name ' +
            'FROM invoices i INNER JOIN circulators c ON i.circulator_id = c.id ' +
            'WHERE i.project_id = ?';
        return queryPromise(sql, [projectId]);
    };

    db.createInvoices = async function (project, date) {
        const projectId = project.id;
        await db.updateProcessedLines(project);
        const circulators = await db.getCirculatorsWhoAreOwed(project, date);
        const dateCreated = moment().format('YYYY-MM-DD');
        const invoiceNumbers = [];
        for (const circulator of circulators) {
            const pages = await db.getUnpaidPagesForCirculator(project, circulator.id, date);
            const validLines = pages.map(p => p.valid_lines).reduce((a, c) => a + c);
            const amount = (project.payPerSignature * validLines).toFixed(2);
            const data = {
                circulator_id: circulator.id,
                date_created: dateCreated,
                amount,
            };
            const invoice = await db.createOrUpdateInvoice({projectId, data});
            await queryPromise(
                'UPDATE pages SET invoice_id = ? WHERE project_id = ? AND number IN (?)',
                [invoice.id, projectId, pages.map(p => p.number)]
            );
            invoiceNumbers.push(invoice.number);
        }
        return invoiceNumbers;
    };
};
