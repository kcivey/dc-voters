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

function formatPageNumber(internalPageNumber, project) {
    let pageNumber = internalPageNumber;
    // let i = 0;
    for (const b of project.batches || []) {
        if (pageNumber <= b) {
            // const prefix = i === 0 ? '' : (project.batches.length < 3 ? 'S-' : 'S' + i + '-');
            return pageNumber + ' of ' + b;
        }
        pageNumber -= b;
        // i++;
    }
    return internalPageNumber;
}

function makeName(v, reversed) {
    let name = v.firstname;
    if (v.middle) {
        name += ' ' + v.middle;
    }
    if (reversed) {
        name = v.lastname + ', ' + name;
    }
    else {
        name += ' ' + v.lastname;
    }
    if (v.suffix) {
        if (reversed) {
            name += ',';
        }
        name += ' ' + v.suffix;
    }
    return name;
}

function makeAddress(v) {
    let address = v.res_house;
    if (v.res_frac) {
        address += '-' + v.res_frac;
    }
    address += ' ' + v.res_street;
    if (v.res_apt) {
        address += ' #' + v.res_apt;
    }
    return address;
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

    responseVotersTsv(req, res, next) {
        const project = req.project;
        if (!project) {
            throw createError(404, 'No project set');
        }
        const filename = project.code + '-voters.tsv';
        db.getResponseLinesWithRegisteredVoters(project)
            .then(function (rows) {
                const tsv = stringify(
                    rows.map(function (row) {
                        return {
                            page: formatPageNumber(row.page, project),
                            line: row.line,
                            voter: makeName(row),
                            address: makeAddress(row),
                            registered: moment(row.registered).format('MM/DD/YYYY'),
                        };
                    }),
                    {delimiter: '\t', header: true}
                );
                res.attachment(filename);
                res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
                res.send(tsv);
            })
            .catch(next);
    },

    responseAddressChangesTsv(req, res, next) {
        const project = req.project;
        if (!project) {
            throw createError(404, 'No project set');
        }
        const filename = project.code + '-address-changes.tsv';
        db.getResponseAddressChanges(project)
            .then(function (rows) {
                const tsv = stringify(
                    rows.map(function (row) {
                        return {
                            voter: makeName(row, true),
                            new_address: row.address,
                            old_address: makeAddress(row),
                            page: formatPageNumber(row.page, project),
                            line: row.line,
                        };
                    }),
                    {delimiter: '\t', header: true}
                );
                res.attachment(filename);
                res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
                res.send(tsv);
            })
            .catch(next);
    },

};
