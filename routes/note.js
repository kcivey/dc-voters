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

    getNote(req, res, next) {
        db.getNote(req.project.id, +req.params.id)
            .then(function (note) {
                if (!note) {
                    throw createError(404, 'No such note');
                }
                res.json(note);
            })
            .catch(next);
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
