const express = require('express');
const logger = require('morgan');
const cookieParser = require("cookie-parser");
const Util = require('./lib/util');
require('dotenv').config();
const init = require('./lib/init');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(function(req, res, next) {
  console.log(`cookies: ${JSON.stringify(req.cookies)}`);
  next();
});
app.use('/users', usersRouter);
app.use('/', indexRouter);
app.use(function(req, res, next) {
  res.sendStatus(404);
});

app.use(function(err, req, res, next) {
  if(err instanceof Util.NotFoundError) {
    res.sendStatus(404);
  } else if(err instanceof Util.PermissionDeniedError) {
    res.sendStatus(401);
  } else if(err instanceof Util.InputError) {
    console.log(err.message)
    res.status(400).send(err.message);
  } else {
    console.error(err)
    res.sendStatus(500)
  }
});

module.exports.app = app;
module.exports.init = init;
