require('dotenv').config();
const {SMTPClient} = require('emailjs');
let client = null;

module.exports = function (message, callback) {
    if (!client) {
        client = new SMTPClient(getEmailConfig());
    }
    client.send(message, callback);
};

function getEmailConfig() {
    const emailConfig = {
        host: 'localhost',
        port: 25,
        ssl: false,
        tls: false,
    };
    const envMapping = {
        HOST: 'host',
        PORT: 'port',
        USER: 'user',
        PASSWORD: 'password',
        SSL: 'ssl',
        TLS: 'tls',
    };
    for (const [envName, configName] of Object.entries(envMapping)) {
        let value = process.env['EMAIL_' + envName];
        if (value === 'true') {
            value = true;
        }
        else if (value === 'false') {
            value = false;
        }
        else if (/^\d+$/.test(value)) {
            value = +value;
        }
        if (value !== undefined) {
            emailConfig[configName] = value;
        }
    }
    return emailConfig;
}
