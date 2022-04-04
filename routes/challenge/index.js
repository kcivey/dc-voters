const fs = require('fs');
const _ = require('underscore');
const createError = require('http-errors');
const db = require('../../lib/db');
const regulations = {
    A: '1607.1(b) not registered at address',
    NM: '1607.1(b) not registered at address',
    NR: '1607.1(b) not registered at address',
    I: '1607.1(f) illegible',
    MA: '1607.1(e) no address',
    MD: '1607.1(d) no date',
    MS: '1607.1(i) signature not made by person purported',
    WP: '1607.1(n) wrong party',
    WW: '1607.1(m) wrong ward',
    D: '1607.1(c)',
    CU: '1607.1(g) circulator not qualified',
    CA: '1607.1(h) circulator affidavit defective',
};

const challengeTemplate = _.template(
    fs.readFileSync(__dirname + '/challenge.html', {encoding: 'utf8'})
        .replace(/^\s+/gm, '')
);

function challenge(req, res, next) {
    const project = req.project;
    if (!project) {
        throw createError(404, 'No project set');
    }
    if (project.type !== 'challenge') {
        throw createError(404, 'No challenge report for this project');
    }
    db.getChallengeLines(project.id, req.query.p)
        .then(function (rows) {
            const challengeInfo = getChallengeInfo(rows, project);
            res.send(challengeTemplate(challengeInfo));
        })
        .catch(next);
}

function getChallengeInfo(rows, project) {
    const circulators = {};
    const data = {};
    rows.forEach(function (row) {
        if (!data[row.page]) {
            data[row.page] = [];
        }
        let signer = '';
        let explanation = '';
        let circulatorExplanation = '';
        if (!circulators[row.page]) {
            if (row.circulator_status) {
                circulatorExplanation = regulations[row.circulator_status] || row.circulator_status;
            }
            if (row.circulator_notes) {
                if (circulatorExplanation) {
                    circulatorExplanation += ' (' + row.circulator_notes + ')';
                }
                else {
                    circulatorExplanation = row.circulator_notes;
                }
            }
            circulators[row.page] = {
                name: row.circulator_name,
                explanation: circulatorExplanation,
            };
        }
        if (row.circulator_status === 'CU') {
            explanation = regulations.CU;
            if (row.circulator_notes) {
                explanation += ' (' + row.circulator_notes + ')';
            }
        }
        if (!['', 'S', 'OK'].includes(row.finding) || explanation) {
            signer = row.voter_name || '';
            if (row.address) {
                if (signer) {
                    signer += '<br>';
                }
                signer += row.address;
            }
            if (row.finding === 'B') {
                signer = '(blank)';
                explanation = '';
            }
            else if (!['', 'S', 'OK', 'D'].includes(row.finding)) { // "Duplicate" is already in the notes
                if (explanation) {
                    explanation += '<br>';
                }
                // explanation = project.findingCodes[row.finding] || row.finding;
                explanation += regulations[row.finding] || row.finding;
            }
            if (row.notes) {
                const m = row.notes.match(/(Duplicate of page \d+, line \d+)/);
                if (m) {
                    explanation += '; ' + (/1607\.1\(c\)/.test(explanation) ? '' : '1607.1(c) ') +
                        m[1].replace('Duplicate', 'duplicate');
                }
                else {
                    explanation += '<br>(' + row.notes + ')';
                }
            }
        }
        data[row.page][row.line - 1] = {signer, explanation};
    });
    return {
        project,
        circulators,
        data,
    };
}

module.exports = challenge;
