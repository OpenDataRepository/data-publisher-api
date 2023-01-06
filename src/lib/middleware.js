const { validate: uuidValidate } = require('uuid');
const bcrypt = require("bcryptjs");
// var passport = require('passport');
const PassportJwt = require('passport-jwt')
const jwt = require("jsonwebtoken");
const User = require('../models/user');
const Permissions = require('../models/permission');
const SharedFunctions = require('../models/shared_functions');
// const { validationResult } = require('express-validator');

const Util = require('./util');


exports.validateUuid = (req, res, next) => {
  if (!uuidValidate(req.params.uuid)) {
    throw new Util.InputError(`The uuid provided (${req.params.uuid}) is not in proper uuid format.`);
  }
  next();
};

exports.validateTimestamp = (req, res, next) => {
  if (!Util.isDateValid(req.params.timestamp)) {
    throw new Util.InputError(`The timestamp provided (${req.params.timestamp}) is not in proper format.`);
  }
  next();
};

exports.getUserFromToken = async (req, res, next) => {
  try {
    const token = PassportJwt.ExtractJwt.fromAuthHeaderWithScheme('Bearer')(req);
    let jwt_payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    let user = await User.model.getBy_id(jwt_payload.sub)
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
      throw new Util.PermissionDeniedError(`Must be logged in`);
    }
    next();
  } catch(err) {
    next(err);
  }  
}

exports.ensureAdminOrSuper = async (req, res, next) => {
  try {
    if(!(await User.model.isAdmin(req.user._id)) && !(await User.model.isSuper(req.user._id))) {
      throw new Util.PermissionDeniedError(`Must be an admin or super user to perform this function`);
    }
    next();
  } catch(err) {
    next(err);
  }  
}

exports.superUserActAs = async (req, res, next) => {
  try {

    if(!req.user || !(await User.model.isSuper(req.user._id))) {
      next();
      return;
    }

    let new_user_email;
    // Transform the super user request to a normal user request with the given properties
    if(req.body.user_email) {
      new_user_email = req.body.user_email;
      delete req.body.user_email;
      let body_values = Object.values(req.body);
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

    let user = await User.model.getByEmail(new_user_email);
    if (!user) { 
      let password = Math.random().toString(36).slice(2, 10); // Random, 8 character password
      let hashed_password = await bcrypt.hash(password, 10);

      let state = Util.initializeState(req);
      let user_model_instance = new User.model(state);
      const callback = async () => {
        let user_id = await user_model_instance.create(new_user_email, hashed_password, true);
      };
      await SharedFunctions.executeWithTransaction(state, callback);
      user = await User.model.getByEmail(new_user_email);
    }
    if(user.suspended) {
      throw new Util.PermissionDeniedError(`User suspended`);
    }
    req.user = user;
    next();
  } catch(err) {
    next(err);
  }  
}