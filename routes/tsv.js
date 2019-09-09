const moment = require('moment');
const config = require('../public/config.json');
const db = require('../lib/db');

function sendTsv(req, res, sql, values) { // eslint-disable-line max-params
    const m = req.path.match(/([^/]+)$/);
    let filename;
    if (m) {
        filename = m[1];
    }
    else {
        filename = 'data.tsv';
    }
    db.query(sql, values, function (err, rows, fields) {
        if (err) {
            console.error(err);
            res.sendStatus(500);
            return;
        }
        const fieldNames = fields.map(field => field.name);
        let content = fieldNames.join('\t') + '\n';
        rows.forEach(function (row) {
            content += fieldNames.map(function (name) {
                if (name === 'check_time' && row.check_time) {
                    return moment(row.check_time).format('YYYY-MM-DD HH:mm:ss');
                }
                if (name === 'date_signed' && row.date_signed) {
                    return moment(row.date_signed).format('YYYY-MM-DD');
                }
                if (typeof row[name] === 'string') {
                    return row[name].replace(/[\n\r\t]/g, ' ');
                }
                return row[name];
            }).join('\t') + '\n';
        });
        res.attachment(filename);
        res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
        res.send(content);
    });
}

module.exports = {

    completedTsv(req, res) {
        let sql = 'SELECT l.*, c.name AS circulator_name';
        if (!req.project) {
            res.sendStatus(404);
            return;
        }
        if (config.party) {
            sql += ', v.party';
        }
        sql += ' FROM petition_lines l LEFT JOIN pages p ON l.project_id = p.project_id AND l.page = p.number ' +
            'LEFT JOIN circulators c ON p.circulator_id = c.id ' +
            'LEFT JOIN voters v ON l.voter_id = v.voter_id ' +
            "WHERE l.project_id = ? AND l.finding <> '' ORDER BY page, line";
        sendTsv(req, res, sql, [req.project.id]);
    },

};
