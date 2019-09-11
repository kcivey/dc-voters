#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const morgan = require('morgan');
const errorHandler = require('errorhandler');
const path = require('path');
const db = require('./lib/db');
const env = process.env.NODE_ENV || 'development';
const staticDir = 'development' === env ? 'src' : 'public';
const apiUrlBase = '/api';

const app = express();
app.set('port', process.env.PORT || 3000);
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
apiApp.use(setProject);
apiApp.get('/search', routes.search);
apiApp.get('/line/:page/:line', routes.getLine);
apiApp.get('/line/:id', routes.getLine);
apiApp.put('/line/:id', routes.updateLine);
apiApp.get('/status', routes.status);
apiApp.post('/mark-blank/:page/:line', routes.markLineBlank);
apiApp.get('/completed.tsv', compression(), routes.completedTsv);
apiApp.get('/dt-line/:checker', compression(), routes.dtLine);
apiApp.get('/dt-line', compression(), routes.dtLine);
apiApp.get('/circulators', routes.getCirculators);
apiApp.post('/circulators', routes.createOrUpdateCirculator);
apiApp.get('/circulators/:id', routes.getCirculator);
apiApp.put('/circulators/:id', routes.createOrUpdateCirculator);
apiApp.delete('/circulators/:id', routes.deleteCirculator);
apiApp.get('/pages', routes.getPages);
apiApp.post('/pages', routes.createOrUpdatePage);
apiApp.get('/pages/:number', routes.getPage);
apiApp.put('/pages/:number', routes.createOrUpdatePage);
apiApp.get('/users', routes.getUsers);
apiApp.post('/users', routes.createOrUpdateUser);
apiApp.get('/users/:id', routes.getUser);
apiApp.put('/users/:id', routes.createOrUpdateUser);
apiApp.post('/users/:username/pages', routes.assignPages);
apiApp.get('/totals', routes.getTotals);

app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});

function setProject(req, res, next) {
    const m = req.url.match(/^\/([\w-]+)\//);
    const projectCode = m && m[1];
    if (!projectCode) {
        return next();
    }
    return db.getProjectByCode(
        projectCode,
        function (err, project) {
            if (err) {
                return res.sendStatus(500);
            }
            if (project) {
                req.project = project;
                req.url = req.url.replace('/' + projectCode, '');
                return next();
            }
            return res.sendStatus(404);
        }
    );
}
