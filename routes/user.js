const createError = require('http-errors');
const db = require('../lib/db');

module.exports = {

    createOrUpdateUser(req, res, next) {
        const projectId = req.project.id;
        const userData = req.body;
        const id = +req.params.id;
        if (!id && !(userData.username && userData.email)) {
            throw createError(400, 'Must have either id or username and email');
        }
        db.createOrUpdateUser(projectId, userData, id)
            .then(user => res.json(user))
            .catch(next);
    },

    getUser(req, res, next) {
        db.getUser({id: +req.params.id})
            .then(function (user) {
                if (!user) {
                    throw createError(404, 'No such user');
                }
                res.json(user);
            })
            .catch(next);
    },

    getUsers(req, res, next) {
        db.getUsersForProject(req.project.id)
            .then(rows => res.json(rows))
            .catch(next);
    },

};
