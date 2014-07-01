/**
 * Express configuration
 */
'use strict';

var compress = require('compression');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var flash = require('express-flash');
var expressValidator = require('express-validator');
var errorHandler = require('errorhandler');
var session = require('express-session');
var logger = require('morgan');<% if (dbOption === 'MongoDB') { %>
var MongoStore = require('connect-mongo')({
    session: session
});<% } %><% if ('MySQL'.indexOf(dbOption) > -1) { %>
var SequelizeStore = require('connect-session-sequelize')(session.Store);<% } %>

// Configuration files
var secrets = require('./secrets');
var settings = require('./settings');
var security = require('./security');

module.exports = function(app, passport, express,<% if ('MySQL'.indexOf(dbOption) > -1) { %> sequelize,<% } %> path) {

    var hour = 3600000;
    var day = hour * 24;
    var week = day * 7;

    var env = app.get('env');

    // Setup port for server to run on
    app.set('port', settings.server.port);

     // Setup view engine for server side templating
    app.engine('.html', require('ejs').__express);
    app.set('view engine', 'html');

    // Remove x-powered-by header (doesn't let clients know we are using Express)
    app.disable('x-powered-by');

    if ('development' === env) {
        app.use(require('connect-livereload')());

        // Setup log level for server console output
        app.use(logger('dev'));

        // Disable caching of scripts for easier testing
        app.use(function noCache(req, res, next) {
            if (req.url.indexOf('/scripts/') === 0) {
                res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.header('Pragma', 'no-cache');
                res.header('Expires', 0);
            }
            next();
        });

        app.use(express.static(path.join(settings.root, settings.staticAssets), {maxAge: week}));
    }

    if ('production' === env || 'test' === env) {
        app.use(compress());
        // Mount public/ folder for static assets and set cache via maxAge
        app.use(express.static(path.join(settings.root, settings.staticAssets), {
            maxAge: week
        }));
    }

    // Setup path where all server templates will reside
    app.set('views', path.join(settings.root, 'lib/views'));

    // Returns middleware that parses both json and urlencoded.
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // Setup server-side validation
    app.use(expressValidator());

    // Parse Cookie header and populate req.cookies with an object keyed by the cookie names
    app.use(cookieParser(secrets.cookieSecret));

    app.use(session({
        secret: secrets.sessionSecret,
        saveUninitialized: true,
        resave: true,
        store: new MongoStore({
            url: settings.database.url,
            auto_reconnect: true,
        }),
        cookie: {
            httpOnly: true, /*, secure: true for HTTPS*/
            maxAge: day
        }
    }));

    // Passport authentication
    app.use(passport.initialize());
    app.use(passport.session());

    // define a flash message and render it without redirecting the request.
    app.use(flash());

    // Initialize Lusca Security
    app.use(function(req, res, next) {
        security(req, res, next);
    });

    app.use(function(req, res, next) {
        res.locals.user = req.user;
        next();
    });

    app.use(function(req, res, next) {
        // Keep track of previous URL to redirect back to
        // original destination after a successful login.
        if (req.method !== 'GET') {
            return next();
        }
        var path = req.path.split('/')[1];
        if (/(auth|login|logout|signup)$/i.test(path)) {
            return next();
        }
        req.session.returnTo = req.path;
        next();
    });

    // Load all routes
    require('fs').readdirSync(path.join(settings.root, './lib/routes/')).forEach(function(file) {
        require(path.join(settings.root, './lib/routes/') + file)(app, passport);
    });

    /**
     * 500 Error Handler.
     * As of Express 4.0 it must be placed at the end of all routes.
     */
    app.use(errorHandler());

};