var passwordHash = require('password-hash'),
    db = require('./db');

module.exports = {
    auth: function (username, password, callback) {
        db.query(
            'SELECT * FROM users WHERE username = ?',
            [username],
            function (err, rows) {
                console.log('db result', err, rows[0]);
                if (err) {
                    callback(err);
                }
                else if (rows.length && passwordHash.verify(password, rows[0].password)) {
                    callback(null, rows[0]);
                }
                else {
                    callback(null, '');
                }
            }
        );
    },
    serialize: function (user, done) {
        done(null, user.id);
    },
    deserialize: function (id, done) {
        db.query(
            'SELECT * FROM users WHERE id = ?',
            [id],
            function (err, rows) {
                if (err) {
                    done(err);
                }
                else if (rows.length) {
                    done(null, rows[0]);
                }
                else {
                    done(null, null);
                }
            }
        );
    }
};
