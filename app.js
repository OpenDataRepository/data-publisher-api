var express = require('express');
var logger = require('morgan');
const Util = require('./lib/util');
require('dotenv').config();
require('./lib/init')();

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/', indexRouter);
app.use('/users', usersRouter);

app.use(function(req, res, next) {
  res.sendStatus(404);
});

app.use(function(err, req, res, next) {
  console.error(err)
  if(err instanceof Util.NotFoundError) {
    res.sendStatus(404);
  } else if(err instanceof Util.InputError) {
    res.status(400).send(err.msg);
  }
  res.sendStatus(500)
});

module.exports = app;