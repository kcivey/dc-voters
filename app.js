
/**
 * Module dependencies.
 */

var express = require('express'),
    http = require('http'),
    path = require('path'),
    config = require('./config');

var auth = express.basicAuth(function(user, pass) {
   return user == 'public' && pass == 'trust';
},'DC Public Trust');

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

var routes = require('./routes')(app);

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.all('/voters', auth, function (req, res, next) { next(); }); // enforce authorization
app.get('/search', express.bodyParser(), routes.search);
app.get('/findLocation', routes.findLocation);
app.get('/voters/line/:page/:line', routes.lineRead);
app.get('/voters/line/:id', routes.lineRead);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
