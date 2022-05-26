const { validate: uuidValidate } = require('uuid');
var passport = require('passport');
const PassportJwt = require('passport-jwt')
const jwt = require("jsonwebtoken");
const User = require('../models/user');
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

exports.ensureLoggedIn = () => {
  return passport.authenticate('jwt', { session: false });
};

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

// exports.handleErrors = (req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   } else {
//     next();
//   }
// };