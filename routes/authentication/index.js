const URL = require('url').URL;
const passwordless = require('passwordless');
const PasswordlessMysqlStore = require('passwordless-mysql');
const session = require('express-session');
const SessionMySqlStore = require('express-mysql-session')(session);
const db = require('../../lib/db');
const sendEmail = require('../../lib/send-email');
const challengeRoute = require('./challenge');
const sessionStore = new SessionMySqlStore({}, db);
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

function setUser(req, res, next) {
    if (req.user) {
        return db.getUser({id: req.user})
            .then(function (user) {
                req.user = user;
                next();
            })
            .catch(function (err) {
                console.error(err);
                res.sendStatus(500);
            });
    }
    return next();
}

module.exports = function (app, apiApp) {
    app.use(session({secret, store: sessionStore, resave: false, saveUninitialized: false}));
    app.use(passwordless.sessionSupport());
    app.use(passwordless.acceptToken({successRedirect: '/'}));
    app.use(setUser);
    app.post(
        '/send-token',
        passwordless.requestToken(
            function (email, delivery, callback) {
                db.getUser({email})
                    .then(function (user) {
                        if (user && !user.blocked) {
                            console.log('sending token for user', user);
                            return callback(null, user.id);
                        }
                        return callback(null, null);
                    })
                    .catch(callback);
            }
        ),
        function (req, res) {
            res.json({sent: true});
        },
    );
    const redirectToFrontPage = (req, res) => res.redirect('/');
    app.get('/login', redirectToFrontPage);
    app.get('/logout', passwordless.logout(), redirectToFrontPage);
    app.get('/challenge.html', passwordless.restricted(), challengeRoute);
    apiApp.use(passwordless.restricted());
};
