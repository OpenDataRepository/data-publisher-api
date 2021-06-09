var express = require('express');
var logger = require('morgan');
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
  console.error(err.stack)
  res.sendStatus(500)
});

module.exports = app;
