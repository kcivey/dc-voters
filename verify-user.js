var passwordHash = require('password-hash'),
    db = require('./db');

module.exports = {
    auth: function (username, password, done) {
        if (!password) {
            return done(null, null);
        }
        getUser({username: username, password: password}, done);
    },
    serialize: function (user, done) {
        done(null, user.id);
    },
    deserialize: function (id, done) {
        getUser({id: id}, done);
    }
};

function getUser(criteria, done) {
    var password = criteria.password;
    delete criteria.password;
    db.query(
        'SELECT * FROM users WHERE ?',
        [criteria],
        function (err, rows) {
            var user;
            console.log('db result', err, rows);
            if (err) {
                return done(err);
            }
            user = rows[0] || null;
            if (!user || (password && !passwordHash.verify(password, user.password))) {
                return done(null, null);
            }
            getProjects(user, function (err, projects) {
                if (err) {
                    return done(err);
                }
                user.projects = projects;
                done(null, user);
            });
        }
    );
}

function getProjects(user, done) {
    db.query(
        'SELECT p.* FROM projects p INNER JOIN project_users pu ON p.id = pu.project_id WHERE pu.user_id = ?',
        [user.id],
        function (err, rows) {
            console.log('db result', err, rows);
            if (err) {
                return done(err);
            }
            done(null, rows);
        }
    );
}
