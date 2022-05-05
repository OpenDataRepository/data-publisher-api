const bcrypt = require ("bcryptjs");
const User = require('../models/user');
const Util = require('../lib/util');
var passport = require('passport');
const email_validator = require("email-validator");

exports.register = async function(req, res, next) {
  // TODO: research how bcrypt works. Don't I need to store some hash value or something
  // for the case when the app goes down and I need to re-calculate passwords?
  try{
    let email = req.body.email;
    if(!email_validator.validate(email)){
      throw new Util.InputError(`email is not in valid email format`);
    }
    let hashed_password = await bcrypt.hash(req.body.password, 10);
    await User.create(email, hashed_password);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.login = async function(req, res, next) {
  passport.authenticate('local', 
    function (err, account) {
      if(err) {
        res.status(500).send(err.message);
      } else if(!account) {
        res.status(400).send('either email or password was incorrect');
      } else {
        req.logIn(account, function() {
          res.sendStatus(200);
        });
      }
    }
  )(req, res, next) 
};

exports.logout = function(req, res, next) {
  req.logout();
  res.sendStatus(200);
};

exports.get = async function(req, res, next) {
  try{
    if(!req.isAuthenticated()) {
      throw new Util.PermissionDeniedError(`Must be logged in to update account`);
    }
    let user = req.user;
    // this should be the same as req.isAuthenticated(), but just put it here for safety.
    if(!user) {
      throw new Util.PermissionDeniedError(`Must be logged in to delete account`);
    }
    let filtered_user = {};
    filtered_user.first_name = user.first_name;
    filtered_user.last_name = user.last_name;
    filtered_user.email = user.email;
    res.send(filtered_user);
  } catch(err) {
    next(err);
  }
};

exports.delete = async function(req, res, next) {
  try{
    if(!req.isAuthenticated()) {
      throw new Util.PermissionDeniedError(`Must be logged in to delete account`);
    }
    // this should be the same as req.isAuthenticated(), but just put it here for safety.
    if(!req.user) {
      throw new Util.PermissionDeniedError(`Must be logged in to delete account`);
    }
    if(!req.body.password) {
      throw new Util.InputError(`Must provide password to delete account.`);
    }
    if(!(await bcrypt.compare(req.body.password, req.user.password))) {
      throw new Util.InputError(`Password incorrect.`);
    }
    await User.delete(req.user._id);
    req.logout();
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};

exports.update = async function(req, res, next) {
  try{
    if(!req.isAuthenticated()) {
      throw new Util.PermissionDeniedError(`Must be logged in to update account`);
    }
    // this should be the same as req.isAuthenticated(), but just put it here for safety.
    if(!req.user) {
      throw new Util.PermissionDeniedError(`Must be logged in to delete account`);
    }
    if(!req.body.verification_password) {
      throw new Util.InputError(`Must provide verification password to delete account.`);
    }
    if(!(await bcrypt.compare(req.body.verification_password, req.user.password))) {
      throw new Util.InputError(`Password incorrect.`);
    }

    let input_update_properties = req.body;
    let filtered_update_properties = {};
    if(input_update_properties.new_password) {
      if(input_update_properties.new_password != input_update_properties.new_password_confirmation) {
        throw new Util.InputError(`new_password and new_password_confirmation must be identical`);
      }
      filtered_update_properties.password = await bcrypt.hash(input_update_properties.new_password, 10);
    }
    filtered_update_properties.first_name = input_update_properties.first_name;
    filtered_update_properties.last_name = input_update_properties.last_name;

    await User.update(req.user._id, filtered_update_properties);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};