const URL = require('url').URL;
const passwordless = require('passwordless');
const PasswordlessMysqlStore = require('passwordless-mysql');
const session = require('express-session');
const SessionMySqlStore = require('express-mysql-session')(session);
const db = require('../lib/db');
const sendEmail = require('../lib/send-email');
const senderEmail = process.env.SENDER_EMAIL;
const secret = process.env.SECRET;
let urlBase;

passwordless.init(new PasswordlessMysqlStore(db.getConnectionString()));
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
            .catch(next);
    }
    return next();
}

module.exports = function (app, apiApp) {
    const sessionStore = new SessionMySqlStore({}, db.getConnection());
    app.use(session({secret, store: sessionStore, resave: false, saveUninitialized: false}));
    app.use(passwordless.sessionSupport());
    app.use(passwordless.acceptToken({successRedirect: '/'}));
    app.use(setUser);
    app.post(
        '/send-token',
        function (req, res, next) {
            // Somewhat klugy way to make a URL that omits unnecessary ports
            const url = new URL('http://localhost');
            url.protocol = req.protocol;
            url.host = req.get('host'); // includes port
            // Set the URL base (no need to have an environment variable for it, which could be wrong)
            urlBase = url.toString().replace(/\/$/, '');
            next();
        },
        passwordless.requestToken(
            function (email, delivery, callback) {
                db.getUser({email})
                    .then(function (user) {
                        if (user && !user.blocked) {
                            return callback(null, user.id);
                        }
                        return callback(null, null);
                    })
                    .catch(callback);
            }
        ),
        function (req, res) {
            res.json({sent: true});
        }
    );
    app.get('/user', (req, res) => res.json(req.user || null)); // get logged-in user
    const redirectToFrontPage = (req, res) => res.redirect('/');
    app.get('/login', redirectToFrontPage);
    app.get('/logout', passwordless.logout(), redirectToFrontPage);
    apiApp.use(passwordless.restricted());
};
