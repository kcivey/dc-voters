var express = require('express'),
    bodyParser = require('body-parser'),
    compression = require('compression'),
    morgan = require('morgan'),
    errorHandler = require('errorhandler'),
    passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    session = require('express-session'),
    http = require('http'),
    path = require('path'),
    config = require('./config'),
    verifyUser = require('./verify-user'),
    urlBase = '/',
    apiUrlBase = urlBase + 'api/';

passport.use('local', new LocalStrategy(verifyUser.auth));
passport.serializeUser(verifyUser.serialize);
passport.deserializeUser(verifyUser.deserialize);

var app = express();

app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({secret: config.get('secret'), resave: false, saveUninitialized: false}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

var routes = require('./routes')(app);

var env = process.env.NODE_ENV || 'development';
if ('development' == env) {
  app.use(errorHandler());
}

app.post(urlBase + 'login', passport.authenticate('local', {successRedirect: urlBase, failureRedirect: urlBase}));
app.get(urlBase + 'logout', routes.logOut);
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
app.get(apiUrlBase + 'users', routes.getUsers);
app.post(apiUrlBase + 'users', routes.createOrUpdateUser);
app.put(apiUrlBase + 'users/:id', routes.createOrUpdateUser);
app.post(apiUrlBase + 'users/:username/pages', routes.assignPages);
app.get(apiUrlBase + 'totals', routes.getTotals);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.sendStatus(401);
}
