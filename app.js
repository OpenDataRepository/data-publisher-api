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
app.use(express.json({limit: '1mb'}));
app.use(express.urlencoded({ limit: '1mb', extended: false }));
app.use(cookieParser());

app.use('/users', usersRouter);
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
module.exports.init = init;
