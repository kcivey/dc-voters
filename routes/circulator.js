const createError = require('http-errors');
const db = require('../lib/db');

module.exports = {

    createOrUpdateCirculator(req, res, next) {
        const projectId = req.project.id;
        const id = +req.params.id;
        const updates = req.body;
        db.createOrUpdateCirculator(projectId, id, updates)
            .then(circulator => res.json(circulator))
            .catch(next);
    },

    deleteCirculator(req, res, next) {
        db.deleteCirculator(req.project.id, +req.params.id)
            .then(function (affectedRows) {
                if (!affectedRows) {
                    throw createError(404, 'No such circulator');
                }
                res.sendStatus(204);
            })
            .catch(next);
    },

    getCirculator(req, res, next) {
        db.getCirculator(req.project.id, +req.params.id)
            .then(function (circulator) {
                if (!circulator) {
                    throw createError(404, 'No such circulator');
                }
                res.json(circulator);
            })
            .catch(next);
    },

    getCirculators(req, res, next) {
        db.updateProcessedLines(req.project)
            .then(() => db.getCirculatorsForProject(req.project.id))
            .then(rows => res.json(rows))
            .catch(next);
    },

    getNextCirculatorNumber(req, res, next) {
        db.getNextCirculatorNumber(req.project.id)
            .then(number => res.json({number}))
            .catch(next);
    },

    async getLineCountsForCirculatorByWard(req, res, next) {
        if (req.query.rate && !/^\d+(?:\.\d+)?(?:(?:,\s*\d+(?:\.\d+)?){7})?$/.test(req.query.rate)) {
            throw createError(400, 'Invalid rate value');
        }
        try {
            const rows = await db.getLineCountsForCirculatorByWard({
                project: req.project,
                circulatorId: +req.params.id,
                startDate: req.query.start,
                endDate: req.query.end,
                unpaid: !!req.query.unpaid,
            });
            const counts = [];
            const totalRow = {number: 'total', total: 0};
            for (let ward = 1; ward <= 8; ward++) {
                totalRow[ward] = 0;
            }
            let current = {page: null};
            for (const r of rows) {
                if (current.number !== r.page) {
                    current = {
                        number: r.page,
                        date_checked: r.date_checked,
                        date_signed: r.date_signed,
                        total: 0,
                    };
                    for (let ward = 1; ward <= 8; ward++) {
                        current[ward] = 0;
                    }
                    counts.push(current);
                }
                current[r.ward] = r.valid;
                current.total += r.valid;
                totalRow[r.ward] += r.valid;
                totalRow.total += r.valid;
            }
            counts.push(totalRow);
            const rate = req.query.rate
                ? /,/.test(req.query.rate)
                    ? req.query.rate.split(/,/).map(n => +n)
                    : +req.query.rate
                : null;
            if (rate) {
                const rateRow = {number: 'rate'};
                const payRow = {number: 'pay', total: 0};
                for (let ward = 1; ward <= 8; ward++) {
                    const wardRate = Array.isArray(rate) ? rate[ward - 1] : rate;
                    const amount = totalRow[ward] * wardRate;
                    payRow.total += amount;
                    payRow[ward] = amount.toFixed(2);
                    rateRow[ward] = wardRate.toFixed(2);
                }
                payRow.total = payRow.total.toFixed(2);
                counts.push(rateRow, payRow);
            }
            return res.json(counts);
        }
        catch (e) {
            return next(e);
        }
    },

    getUnpaidPagesForCirculator(req, res, next) {
        db.getUnpaidPagesForCirculator({
            project: req.project,
            circulatorId: +req.params.id,
            startDate: req.query.start,
            endDate: req.query.end,
        })
            .then(rows => res.json(rows))
            .catch(next);
    },

};
