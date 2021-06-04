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

//TODO: Catch uncaught routes and return 404

//TODO: Catch internal server errors and return 500

module.exports = app;
