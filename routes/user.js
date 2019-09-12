const db = require('../lib/db');

module.exports = {

    createOrUpdateUser(req, res) {
        const projectId = req.project.id;
        const userData = req.body;
        const id = +req.params.id;
        if (!id && !(userData.username && userData.email)) {
            return res.sendStatus(400);
        }
        return db.createOrUpdateUser(projectId, userData, id)
            .then(user => res.json(user))
            .catch(function (err) {
                console.log(err);
                res.sendStatus(500);
            });
    },

    getUser(req, res) {
        db.getUser({id: +req.params.id})
            .then(function (user) {
                if (user) {
                    return res.json(user);
                }
                return res.sendStatus(404);
            })
            .catch(function (err) {
                console.log(err);
                res.sendStatus(500);
            });
    },

    getUsers(req, res) {
        db.getUsersForProject(req.project.id)
            .then(rows => res.json(rows))
            .catch(function (err) {
                console.error(err);
                res.sendStatus(500);
            });
    },

};
