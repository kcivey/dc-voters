var email = require('emailjs'),
    config = require('./config'),
    server =  null;

module.exports = function (message, callback) {
    if (!server) {
        server = email.server.connect(config.get('email'));
    }
    server.send(message, callback);
};
