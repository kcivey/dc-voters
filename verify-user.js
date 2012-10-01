var passwordHash = require('password-hash'),
    db = require('./db');

module.exports.auth = function (username, password, callback) {
    db.query(
        'SELECT * FROM users WHERE username = ?',
        [username],
        function (err, rows) {
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
};
