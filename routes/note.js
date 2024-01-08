const createError = require('http-errors');
const db = require('../lib/db');

module.exports = {

    createOrUpdateNote(req, res, next) {
        const projectId = req.project.id;
        const id = +req.params.id;
        const data = req.body;
        data.user_id = req.user.id;
        db.createOrUpdateNote({projectId, id, data})
            .then(note => res.json(note))
            .catch(next);
    },

    async getNote(req, res, next) {
        const projectId = req.project.id;
        try {
            const note = req.params.voter_id
                ? await db.getNoteByVoterAndUser(projectId, +req.params.voter_id, +req.params.user_id)
                : await db.getNote(projectId, +req.params.id);
            if (!note) {
                throw createError(404, 'No such note');
            }
            return res.json(note);
        }
        catch (e) {
            return next(e);
        }
    },

    deleteNote(req, res, next) {
        db.deleteNote(req.project.id, +req.params.id)
            .then(function (affectedRows) {
                if (!affectedRows) {
                    throw createError(404, 'No such note');
                }
                res.sendStatus(204);
            })
            .catch(next);
    },

};
