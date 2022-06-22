// TODO: switch to typescript. The compiler will catch a lot of errors for me in that way
// so I don't have to hunt them down myself

const express = require('express');
const logger = require('morgan');
const cookieParser = require("cookie-parser");
// var passport = require('passport');
const Util = require('./lib/util');
require('dotenv').config();
const init = require('./lib/init');
const MongoDB = require('./lib/mongoDB');
var indexRouter = require('./routes/index');
// const PassportImplementation = require('./lib/passport_implementation');
const { getUserFromToken, superUserActAs } = require('./lib/middleware');


var app = express();

app.use(logger('dev'));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ limit: '10mb', extended: false }));
app.use(cookieParser());

// passport.use(PassportImplementation.JWTStrategy);

// app.use(passport.initialize());

app.use(getUserFromToken);
app.use(superUserActAs);

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
// init and close are currently only used to set up the db and shut it back down
module.exports.init = init;
module.exports.close = async () => {
  await MongoDB.close();
}
