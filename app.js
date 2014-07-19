
/**
 * Module dependencies.
 */

var express = require('express'),
    http = require('http'),
    path = require('path'),
    config = require('./config'),
    verifyUser = require('./verify-user'),
    urlBase = '/voters/';

var auth = express.basicAuth(verifyUser.auth, 'Validation');

var app = express();

express.logger.token('user', function (req, res) {
    return req.user || '-';
});
var logFormat = ':remote-addr :user - [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger(logFormat));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

var routes = require('./routes')(app);

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.all(urlBase + '*', auth, function (req, res, next) { next(); }); // enforce authorization
app.get('/search', express.bodyParser(), routes.search);
app.get('/findLocation', routes.findLocation);
app.get(urlBase + 'line/:page/:line', routes.lineRead);
app.get(urlBase + 'line/:id', routes.lineRead);
app.put(urlBase + 'line/:id', express.bodyParser(), routes.lineUpdate);
app.get(urlBase + 'status', routes.status);
app.post(urlBase + 'mark-blank/:page/:line', routes.markBlank);
app.get(urlBase + 'completed.tsv', express.compress(), routes.completedTsv);
app.get(urlBase + 'dt-line/:checker', express.compress(), routes.dtLine);
app.get(urlBase + 'dt-line', express.compress(), routes.dtLine);
app.get(urlBase + 'users', routes.getUsers);
app.post(urlBase + 'users', express.bodyParser(), routes.createOrUpdateUser);
app.put(urlBase + 'users/:id', express.bodyParser(), routes.createOrUpdateUser);
app.post(urlBase + 'users/:username/pages', express.bodyParser(), routes.assignPages);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
