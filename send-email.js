var email = require('emailjs'),
    config = require('./config'),
    server =  null;

console.log(config.get('email'));

module.exports = function (message, callback) {
    if (!server) {
        server = email.server.connect(config.get('email'));
    }
    server.send(message, callback);
};
