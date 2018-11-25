#!/usr/bin/env node

var express = require('express'),
    bodyParser = require('body-parser'),
    compression = require('compression'),
    morgan = require('morgan'),
    errorHandler = require('errorhandler'),
    passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    session = require('express-session'),
    MySQLStore = require('express-mysql-session')(session),
    db = require('./db'),
    sessionStore = new MySQLStore({}, db),
    path = require('path'),
    config = require('./config'),
    verifyUser = require('./verify-user'),
    apiUrlBase = '/api/';

passport.use('local', new LocalStrategy(verifyUser.auth));
passport.serializeUser(verifyUser.serialize);
passport.deserializeUser(verifyUser.deserialize);

var app = express();

app.set('port', process.env.PORT || 3000);
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public'), {maxAge: '15m'}));
app.use(session({secret: config.get('secret'), store: sessionStore, resave: false, saveUninitialized: false}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

var routes = require('./routes')(app);

var env = process.env.NODE_ENV || 'development';
if ('development' === env) {
  app.use(errorHandler());
}

app.use(function setProject(req, res, next) {
    var m = req.url.match(/^(?:\/api)?\/([\w-]+)\//),
        projectCode = m && m[1];
    if (!m || projectCode === 'api') {
        return next();
    }
    db.query(
        'SELECT * FROM projects WHERE code = ?',
        [projectCode],
        function (err, rows) {
            console.log('db result', err, rows);
            if (err) {
                res.sendStatus(500);
            }
            else if (rows.length) {
                console.log('setting project', rows[0]);
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

app.post('/login', passport.authenticate('local', {successRedirect: '/', failureRedirect: '/'}));
app.get('/logout', routes.logOut);
app.get('/challenge.html', isAuthenticated, routes.challenge);
app.all(apiUrlBase + '*', isAuthenticated);
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
app.get(apiUrlBase + 'pages', routes.getPages);
app.post(apiUrlBase + 'pages', routes.createOrUpdatePage);
app.get(apiUrlBase + 'pages/:id', routes.getPage);
app.put(apiUrlBase + 'pages/:id', routes.createOrUpdatePage);
app.get(apiUrlBase + 'users', routes.getUsers);
app.post(apiUrlBase + 'users', routes.createOrUpdateUser);
app.put(apiUrlBase + 'users/:id', routes.createOrUpdateUser);
app.post(apiUrlBase + 'users/:username/pages', routes.assignPages);
app.get(apiUrlBase + 'totals', routes.getTotals);

app.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
      return next();
  }
  res.sendStatus(401);
}
