#!/usr/bin/env node

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
const config = require('./lib/config');
const sendEmail = require('./lib/send-email');
const apiUrlBase = '/api/';

passwordless.init(new PasswordlessMysqlStore(db.connectionString));
passwordless.addDelivery(
    function (tokenToSend, uidToSend, recipient, callback) {
        const urlBase = config.get('urlBase');
        const host = (new URL(urlBase)).host;
        sendEmail(
            {
                text: 'Log into your account with this link:\n' + urlBase +
                    '/login?token=' + tokenToSend + '&uid=' + encodeURIComponent(uidToSend) + '\n\n' +
                    'This link can be used only once and will expire, but you can be sent a fresh link if ' +
                    'you submit your email address in the form you get at the site.',
                from: config.get('senderEmail'),
                to: recipient,
                subject: 'Login link for ' + host,
            },
            function (err, message) {
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
app.use(session({secret: config.get('secret'), store: sessionStore, resave: false, saveUninitialized: false}));
app.use(passwordless.sessionSupport());
app.use(passwordless.acceptToken({successRedirect: '/'}));
app.use(function (req, res, next) {
    if (req.user) {
        db.getUser({id: req.user},
            function (err, user) {
                if (err) {
                    res.sendStatus(500);
                }
                else {
                    req.user = user;
                    next();
                }
            }
        );
    }
    else {
        next();
    }
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
    db.query(
        'SELECT * FROM projects WHERE code = ?',
        [projectCode],
        function (err, rows) {
            if (err) {
                res.sendStatus(500);
            }
            else if (rows.length) {
                req.project = rows[0];
                req.url = req.url.replace('/' + rows[0].code, '');
                next();
            }
            else {
                res.sendStatus(404);
            }
        }
    );
});

app.post(
    '/send-token',
    passwordless.requestToken(
        function (email, delivery, callback, req) {
            db.getUser({email: email},
                function (err, user) {
                    if (err) {
                        callback(err);
                    }
                    else if (user && !user.blocked) {
                        console.log('sending token for user', user);
                        callback(null, user.id);
                    }
                    else {
                        callback(null, null);
                    }
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
app.use(apiUrlBase, passwordless.restricted());
app.get(apiUrlBase + 'search', routes.search);
app.get(apiUrlBase + 'line/:page/:line', routes.lineRead);
app.get(apiUrlBase + 'line/:id', routes.lineRead);
app.put(apiUrlBase + 'line/:id', routes.lineUpdate);
app.get(apiUrlBase + 'status', routes.status);
app.post(apiUrlBase + 'mark-blank/:page/:line', routes.markBlank);
app.get(apiUrlBase + 'completed.tsv', compression(), routes.completedTsv);
app.get(apiUrlBase + 'dt-line/:checker', compression(), routes.dtLine);
app.get(apiUrlBase + 'dt-line', compression(), routes.dtLine);
app.get(apiUrlBase + 'circulators', routes.getCirculators);
app.post(apiUrlBase + 'circulators', routes.createOrUpdateCirculator);
app.get(apiUrlBase + 'circulators/:id', routes.getCirculator);
app.put(apiUrlBase + 'circulators/:id', routes.createOrUpdateCirculator);
app.delete(apiUrlBase + 'circulators/:id', routes.deleteCirculator);
app.get(apiUrlBase + 'pages', routes.getPages);
app.post(apiUrlBase + 'pages', routes.createOrUpdatePage);
app.get(apiUrlBase + 'pages/:number', routes.getPage);
app.put(apiUrlBase + 'pages/:number', routes.createOrUpdatePage);
app.get(apiUrlBase + 'users', routes.getUsers);
app.post(apiUrlBase + 'users', routes.createOrUpdateUser);
app.get(apiUrlBase + 'users/:id', routes.getUser);
app.put(apiUrlBase + 'users/:id', routes.createOrUpdateUser);
app.post(apiUrlBase + 'users/:username/pages', routes.assignPages);
app.get(apiUrlBase + 'totals', routes.getTotals);

app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});
