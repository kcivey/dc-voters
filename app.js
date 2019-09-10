#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const morgan = require('morgan');
const errorHandler = require('errorhandler');
const passwordless = require('passwordless');
const PasswordlessMysqlStore = require('passwordless-mysql');
const session = require('express-session');
const SessionMySqlStore = require('express-mysql-session')(session);
const db = require('./lib/db');
const sessionStore = new SessionMySqlStore({}, db);
const path = require('path');
const URL = require('url').URL;
const sendEmail = require('./lib/send-email');
const apiUrlBase = '/api/';
const urlBase = process.env.URL_BASE;
const senderEmail = process.env.SENDER_EMAIL;
const secret = process.env.SECRET;

passwordless.init(new PasswordlessMysqlStore(db.connectionString));
passwordless.addDelivery(
    function (tokenToSend, uidToSend, recipient, callback) { // eslint-disable-line max-params
        const host = (new URL(urlBase)).host;
        sendEmail(
            {
                text: 'Log into your account with this link:\n' + urlBase +
                    '/login?token=' + tokenToSend + '&uid=' + encodeURIComponent(uidToSend) + '\n\n' +
                    'This link can be used only once and will expire, but you can be sent a fresh link if ' +
                    'you submit your email address in the form you get at the site.',
                from: senderEmail,
                to: recipient,
                subject: 'Login link for ' + host,
            },
            function (err) {
                if (err) {
                    console.log(err);
                }
                callback(err);
            }
        );
    }
);

const app = express();

app.set('port', process.env.PORT || 3000);
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public'), {maxAge: '15m'}));
app.use(session({secret, store: sessionStore, resave: false, saveUninitialized: false}));
app.use(passwordless.sessionSupport());
app.use(passwordless.acceptToken({successRedirect: '/'}));
app.use(function (req, res, next) {
    if (req.user) {
        return db.getUser(
            {id: req.user},
            function (err, user) {
                if (err) {
                    return res.sendStatus(500);
                }
                req.user = user;
                return next();
            }
        );
    }
    return next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

const routes = require('./routes')(app);
const env = process.env.NODE_ENV || 'development';
if ('development' === env) {
    app.use(errorHandler());
}

app.use(function setProject(req, res, next) {
    const m = req.url.match(/^(?:\/api)?\/([\w-]+)\//);
    const projectCode = m && m[1];
    if (!m || projectCode === 'api') {
        return next();
    }
    return db.query(
        'SELECT * FROM projects WHERE code = ?',
        [projectCode],
        function (err, rows) {
            if (err) {
                return res.sendStatus(500);
            }
            if (rows.length) {
                req.project = rows[0];
                req.url = req.url.replace('/' + rows[0].code, '');
                return next();
            }
            return res.sendStatus(404);
        }
    );
});

app.post(
    '/send-token',
    passwordless.requestToken(
        function (email, delivery, callback) {
            db.getUser(
                {email},
                function (err, user) {
                    if (err) {
                        return callback(err);
                    }
                    if (user && !user.blocked) {
                        console.log('sending token for user', user);
                        return callback(null, user.id);
                    }
                    return callback(null, null);
                }
            );
        }
    ),
    routes.sendToken
);
const redirectToFrontPage = (req, res) => res.redirect('/');
app.get('/login', redirectToFrontPage);
app.get('/logout', passwordless.logout(), redirectToFrontPage);
app.get('/challenge.html', passwordless.restricted(), routes.challenge);
const apiApp = express();
app.use(apiUrlBase, apiApp);
apiApp.use(passwordless.restricted());
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
