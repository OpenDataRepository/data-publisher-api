const { validate: uuidValidate } = require('uuid');
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

// exports.handleErrors = (req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   } else {
//     next();
//   }
// };