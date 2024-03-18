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

    getLineCountsForCirculator(req, res, next) {
        db.getLineCountsForCirculator({
            project: req.project,
            circulatorId: +req.params.id,
            startDate: req.query.start,
            endDate: req.query.end,
        })
            .then(rows => res.json(rows[0]))
            .catch(next);
    },

    async getLineCountsForCirculatorByWard(req, res, next) {
        try {
            const rows = await db.getLineCountsForCirculatorByWard({
                project: req.project,
                circulatorId: +req.params.id,
                startDate: req.query.start,
                endDate: req.query.end,
            });
            const counts = Array(9).fill(0);
            for (const r of rows) {
                counts[r.ward] = r.valid;
                counts[0] += r.valid;
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
