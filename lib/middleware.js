const { validate: uuidValidate } = require('uuid');
// var passport = require('passport');
const PassportJwt = require('passport-jwt')
const jwt = require("jsonwebtoken");
const User = require('../models/user');
const UserPermissions = require('../models/user_permissions');
// const { validationResult } = require('express-validator');

const Util = require('./util');


exports.validateUuid = (req, res, next) => {
  if (!uuidValidate(req.params.uuid)) {
    throw new Util.InputError(`The uuid provided (${req.params.uuid}) is not in proper uuid format.`);
  }
  next();
};

exports.validateTimestamp = (req, res, next) => {
  if (isNaN(Date.parse(req.params.timestamp))) {
    throw new Util.InputError(`The timestamp provided (${req.params.timestamp}) is not in proper format.`);
  }
  next();
};

// exports.ensureLoggedIn = () => {
//   return passport.authenticate('jwt', { session: false });
// };

exports.getUserFromToken = async (req, res, next) => {
  try {
    const token = PassportJwt.ExtractJwt.fromAuthHeaderWithScheme('Bearer')(req);
    let jwt_payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    let user = await User.getBy_id(jwt_payload.sub)
    if (user) { 
      req.user = user;
    } else {
      req.user = false;
    }
  } catch(err) {
    req.user = false;
  }
  next();
  
}

exports.ensureLoggedIn = async (req, res, next) => {
  try {
    if(!req.user) {
      throw new Util.PermissionDeniedError(`Must be looged in`);
    }
    next();
  } catch(err) {
    next(err);
  }  
}

exports.superUserActAs = async (req, res, next) => {
  try {

    if(!req.user || !(await UserPermissions.isSuper(req.user._id))) {
      next();
      return;
    }

    let new_user_email;
    // Transform the super user request to a normal user request with the given properties
    if(req.body.user_email) {
      new_user_email = req.body.user_email;
      delete req.body.user_email;
      let body_values = req.body.values;
      if(body_values.length > 1){
        throw new Util.InputError(`Post request as super user may only supply user_email and primary object`);
      }
      req.body = body_values[0];
    } else if(req.query.user_email) {
      new_user_email = req.query.user_email;
    } else {
      next();
      return;
    }

    let user = await User.getByEmail(new_user_email);
    if (!user) { 
      // TODO: create a user with this email and no password
      throw new Util.InputError(`Email does not exist and does not yet support generating users dynamically`);
    }
    req.user = user;
    next();
  } catch(err) {
    next(err);
  }  
}

// exports.handleErrors = (req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   } else {
//     next();
//   }
// };