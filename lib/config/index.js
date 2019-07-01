var nconf = require('nconf'),
    path = require('path');
nconf.file('local', {file: path.join(__dirname, 'config-local.json')})
    .file('defaults', {file: path.join(__dirname, 'config-defaults.json')});
module.exports = nconf;
