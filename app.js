const express = require('express');
const logger = require('morgan');
const cookieParser = require("cookie-parser");
const session = require('express-session');
var passport = require('passport');
const MongoStore = require('connect-mongo');
const Util = require('./lib/util');
require('dotenv').config();
const init = require('./lib/init');
const MongoDB = require('./lib/mongoDB');
var indexRouter = require('./routes/index');
const PassportImplementation = require('./lib/passport_implementation');

var app = express();

app.use(logger('dev'));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ limit: '10mb', extended: false }));
app.use(cookieParser());

/**
 * This function is called when the `passport.authenticate()` method is called.
 * 
 * If a user is found and validated, a callback is called (`cb(null, user)`) with the user
 * object.  The user object is then serialized with `passport.serializeUser()` and added to the 
 * `req.session.passport` object. 
 */
passport.use(PassportImplementation.LocalStrategy);

/**
 * This function is used in conjunction with the `passport.authenticate()` method.  See comments in
 * `passport.use()` above ^^ for explanation
 */
passport.serializeUser(PassportImplementation.serializeUser);
/**
* This function is used in conjunction with the `app.use(passport.session())` middleware defined below.
* Scroll down and read the comments in the PASSPORT AUTHENTICATION section to learn how this works.
* 
* In summary, this method is "set" on the passport object and is passed the user ID stored in the `req.session.passport`
* object later on.
*/
passport.deserializeUser(PassportImplementation.deserializeUser);

/**
 * -------------- SESSION SETUP ----------------
 */
/**
 * The MongoStore is used to store session data.  We will learn more about this in the post.
 * 
 * Note that the `connection` used for the MongoStore is the same connection that we are using above
 */
const sessionStore = MongoStore.create({ mongoUrl: process.env.DB, collection: 'sessions' });
/**
* See the documentation for all possible options - https://www.npmjs.com/package/express-session
* 
* As a brief overview (we will add more later): 
* 
* secret: This is a random string that will be used to "authenticate" the session.  In a production environment,
* you would want to set this to a long, randomly generated string
* 
* resave: when set to true, this will force the session to save even if nothing changed.  If you don't set this, 
* the app will still run but you will get a warning in the terminal
* 
* saveUninitialized: Similar to resave, when set true, this forces the session to be saved even if it is unitialized
*
* store: Sets the MemoryStore to the MongoStore setup earlier in the code.  This makes it so every new session will be 
* saved in a MongoDB database in a "sessions" table and used to lookup sessions
* 
* cookie: The cookie object has several options, but the most important is the `maxAge` property.  If this is not set, 
* the cookie will expire when you close the browser.  Note that different browsers behave slightly differently with this
* behaviour (for example, closing Chrome doesn't always wipe out the cookie since Chrome can be configured to run in the
* background and "remember" your last browsing session)
*/
const second = 1000;
const minute = second * 60;
const hour = minute * 60;
const day = hour * 24;
app.use(session({
  // TODO: figure out this secret thing and do it properly with process.env.SECRET
  //secret: process.env.SECRET,
  secret: 'some secret',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: {
    maxAge: day
  }
}));

 /**
 * -------------- PASSPORT AUTHENTICATION ----------------
 */
/**
 * Notice that these middlewares are initialized after the `express-session` middleware.  This is because
 * Passport relies on the `express-session` middleware and must have access to the `req.session` object.
 * 
 * passport.initialize() - This creates middleware that runs before every HTTP request.  It works in two steps: 
 *      1. Checks to see if the current session has a `req.session.passport` object on it.  This object will be
 *          
 *          { user: '<Mongo DB user ID>' }
 * 
 *      2.  If it finds a session with a `req.session.passport` property, it grabs the User ID and saves it to an 
 *          internal Passport method for later.
 *  
 * passport.session() - This calls the Passport Authenticator using the "Session Strategy".  Here are the basic
 * steps that this method takes:
 *      1.  Takes the MongoDB user ID obtained from the `passport.initialize()` method (run directly before) and passes
 *          it to the `passport.deserializeUser()` function (defined above in this module).  The `passport.deserializeUser()`
 *          function will look up the User by the given ID in the database and return it.
 *      2.  If the `passport.deserializeUser()` returns a user object, this user object is assigned to the `req.user` property
 *          and can be accessed within the route.  If no user is returned, nothing happens and `next()` is called.
 */
app.use(passport.initialize());
app.use(passport.session());

app.use('/', indexRouter);
app.use(function(req, res, next) {
  res.sendStatus(404);
});

app.use(function(err, req, res, next) {
  if(err instanceof Util.NotFoundError) {
    res.status(404).send(err.message);
  } else if(err instanceof Util.PermissionDeniedError) {
    res.status(401).send(err.message);
  } else if(err instanceof Util.InputError) {
    res.status(400).send(err.message);
  } else {
    console.error(err)
    res.sendStatus(500)
  }
});

module.exports.app = app;
// TODO: rename init and close to initDBConnection and closeDBConnections
module.exports.init = init;
module.exports.close = async () => {
  await MongoDB.close();
  await sessionStore.close();
}
