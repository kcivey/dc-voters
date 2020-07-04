const stringify = require('csv-stringify/lib/sync');
const moment = require('moment');
const createError = require('http-errors');
const db = require('../lib/db');

function transformRow(row, columns) {
    const newRow = {};
    for (const column of columns) {
        const value = row[column];
        newRow[column] =
            column === 'check_time' && value
                ? moment(value).format('YYYY-MM-DD HH:mm:ss')
                : column === 'date_signed' && value
                    ? moment(value).format('YYYY-MM-DD')
                    : typeof value === 'string'
                        ? value.replace(/[\n\r\t]/g, ' ')
                        : value;
    }
    return newRow;
}

module.exports = {

    completedTsv(req, res, next) {
        if (!req.project) {
            throw createError(404, 'No project set');
        }
        const m = req.path.match(/([^/?]+)$/);
        const filename = m ? m[1] : 'data.tsv';
        const findings = /address/.test(filename) ? ['A'] : [];
        const columns = [
            'page',
            'line',
            'checker',
            'check_time',
            'voter_id',
            'finding',
            'voter_name',
            'address',
            'ward',
            'date_signed',
            'party',
            'notes',
            'circulator_name',
        ];
        if (req.project.type !== 'petition') {
            columns.push('challenged', 'challenge_reason', 'rebuttal');
        }
        db.getCompletedLines(req.project, findings)
            .then(function (rows) {
                const tsv = stringify(
                    rows.map(row => transformRow(row, columns)),
                    {delimiter: '\t', header: true}
                );
                res.attachment(filename);
                res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
                res.send(tsv);
            })
            .catch(next);
    },

};
