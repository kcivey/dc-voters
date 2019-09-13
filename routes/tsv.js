const stringify = require('csv-stringify/lib/sync');
const moment = require('moment');
const config = require('../public/config.json');
const db = require('../lib/db');

function transformRow(row) {
    const newRow = {};
    for (const [column, value] of Object.entries(row)) {
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
        db.getCompletedLines(req.project.id, config.party)
            .then(function (rows) {
                const m = req.path.match(/([^/]+)$/);
                const filename = m ? m[1] : 'data.tsv';
                rows = rows.map(transformRow);
                const tsv = stringify(rows, {delimiter: '\t', headers: true});
                res.attachment(filename);
                res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
                res.send(tsv);
            })
            .catch(next);
    },

};
