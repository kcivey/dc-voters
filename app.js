#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const errorHandler = require('errorhandler');
const createError = require('http-errors');
const db = require('./lib/db');
const uploadHandler = require('./lib/upload-handler');
const env = process.env.NODE_ENV || 'development';
const staticDir = 'development' === env ? 'src' : 'public';
const apiUrlBase = '/api';

// Override unused remote-user
morgan.token('remote-user', (req, res) => (req.user ? req.user.username : ''));
const app = express();
app.set('port', process.env.PORT || 3000);
app.set('trust proxy', 'loopback');
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, staticDir), {maxAge: '15m'}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
if ('development' === env) {
    app.use(errorHandler());
}

const routes = require('./routes')(app);
const apiApp = express();
routes.authentication(app, apiApp);
app.use(apiUrlBase, apiApp);
app.use(setProject);
app.get(
    '/page-images/*',
    function (req, res, next) {
        req.url = req.url.replace('/page-images', '/page-images/' + req.project.code);
        next();
    },
    express.static(path.join(__dirname, staticDir), {maxAge: '15m'})
);
apiApp.use(setProject);
apiApp.get('/project', routes.getProject);
apiApp.get('/search', routes.search);
apiApp.get('/line/:page/:line', routes.getLine);
apiApp.get('/line/:id', routes.getLine);
apiApp.put('/line/:id', routes.updateLine);
apiApp.get('/status', routes.status);
apiApp.post('/mark-blank/:page/:line', routes.markLineBlank);
apiApp.get('/completed.tsv', routes.completedTsv);
apiApp.get('/address-changes.tsv', routes.completedTsv);
apiApp.get('/dt-line/:checker', routes.dtLine);
apiApp.get('/dt-line', routes.dtLine);
apiApp.get('/circulators', routes.getCirculators);
apiApp.post('/circulators', routes.createOrUpdateCirculator);
apiApp.get('/circulators/:id', routes.getCirculator);
apiApp.put('/circulators/:id', routes.createOrUpdateCirculator);
apiApp.delete('/circulators/:id', routes.deleteCirculator);
apiApp.get('/pages/dt', routes.dtPages);
apiApp.post('/pages/images', uploadHandler.array('images'), routes.uploadPageImages);
apiApp.get('/pages', routes.getPages);
apiApp.post('/pages', routes.createOrUpdatePage);
apiApp.get('/pages/:number', routes.getPage);
apiApp.post('/invoices/create/:date', routes.createInvoices);
apiApp.put('/pages/:number', routes.createOrUpdatePage);
apiApp.get('/invoices', routes.getInvoices);
apiApp.post('/invoices', routes.createOrUpdateInvoice);
apiApp.get('/invoices/:number', routes.getInvoice);
apiApp.put('/invoices/:number', routes.createOrUpdateInvoice);
apiApp.get('/users', routes.getUsers);
apiApp.post('/users', routes.createOrUpdateUser);
apiApp.get('/users/usernames', routes.getUsernames);
apiApp.get('/users/:id', routes.getUser);
apiApp.put('/users/:id', routes.createOrUpdateUser);
apiApp.post('/users/:username/pages', routes.assignPages);
apiApp.get('/totals', routes.getTotals);
apiApp.get('/challenge.html', routes.challenge);

app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});

function setProject(req, res, next) {
    const m = req.url.match(/^\/([\w-]+)\//);
    const projectCode = m && m[1];
    if (!projectCode) {
        return next();
    }
    return db.getProjectByCode(projectCode)
        .then(function (project) {
            if (project && req.user.projects.find(p => p.code === project.code)) {
                req.project = project;
                req.url = req.url.replace('/' + projectCode, '');
                return next();
            }
            throw createError(404, 'No such project');
        })
        .catch(next);
}
