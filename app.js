
/**
 * Module dependencies.
 */

var express = require('express'),
    jsonParser = require('body-parser').json(),
    compression = require('compression'),
    morgan = require('morgan'),
    errorHandler = require('errorhandler'),
    passport = require('passport'),
    BasicStrategy = require('passport-http').BasicStrategy,
    http = require('http'),
    path = require('path'),
    config = require('./config'),
    verifyUser = require('./verify-user'),
    urlBase = '/';

passport.use(new BasicStrategy(verifyUser.auth));

var app = express();

app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));

var routes = require('./routes')(app);

var env = process.env.NODE_ENV || 'development';
if ('development' == env) {
  app.use(errorHandler());
}

app.all(urlBase + '*',   passport.authenticate('basic', { session: false }), function (req, res, next) { next(); }); // enforce authorization
app.get('/search', routes.search);
app.get(urlBase + 'line/:page/:line', routes.lineRead);
app.get(urlBase + 'line/:id', routes.lineRead);
app.put(urlBase + 'line/:id', jsonParser, routes.lineUpdate);
app.get(urlBase + 'status', routes.status);
app.post(urlBase + 'mark-blank/:page/:line', routes.markBlank);
app.get(urlBase + 'completed.tsv', compression(), routes.completedTsv);
app.get(urlBase + 'dt-line/:checker', compression(), routes.dtLine);
app.get(urlBase + 'dt-line', compression(), routes.dtLine);
app.get(urlBase + 'users', routes.getUsers);
app.post(urlBase + 'users', jsonParser, routes.createOrUpdateUser);
app.put(urlBase + 'users/:id', jsonParser, routes.createOrUpdateUser);
app.post(urlBase + 'users/:username/pages', jsonParser, routes.assignPages);
app.get(urlBase + 'totals', routes.getTotals);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
