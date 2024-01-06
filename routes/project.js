const db = require('../lib/db');

module.exports = {

    updateProject(req, res, next) {
        const id = req.project.id;
        const projectData = req.body;
        delete projectData.id;
        db.createOrUpdateProject(id, projectData)
            .then(project => res.json(project))
            .catch(next);
    },

    getProject(req, res) {
        res.json(req.project);
    },

};
