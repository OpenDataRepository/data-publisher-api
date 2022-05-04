const bcrypt = require ("bcryptjs");
const User = require('../models/user');
const Util = require('../lib/util');
var passport = require('passport');


exports.register = async function(req, res, next) {
  // TODO: research how bcrypt works. Don't I need to store some hash value or something
  // for the case when the app goes down and I need to re-calculate passwords?
  try{
    let hashed_password = await bcrypt.hash(req.body.password, 10);
    await User.create(req.body.username, hashed_password);
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
        res.status(400).send('either username or password was incorrect');
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

exports.delete = async function(req, res, next) {
  try{
    if(!req.isAuthenticated()) {
      throw new Util.InputError(`Must be logged in to delete account`);
    }
    // this should be the same as req.isAuthenticated(), but just put it here for safety.
    if(!req.user) {
      throw new Util.InputError(`Must be logged in to delete account`);
    }
    if(!req.body.password) {
      throw new Util.InputError(`Must provide password to delete account.`);
    }
    if(!(await bcrypt.compare(req.body.password, req.user.password))) {
      throw new Util.InputError(`Password incorrect.`);
    }
    await User.delete(req.user._id);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
};