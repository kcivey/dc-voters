const email = require('emailjs');
const config = require('./config');
let server = null;

module.exports = function (message, callback) {
    if (!server) {
        server = email.server.connect(config.get('email'));
    }
    server.send(message, callback);
};
