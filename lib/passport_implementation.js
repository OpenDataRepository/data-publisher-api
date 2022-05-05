const bcrypt = require ("bcryptjs");
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/user');

exports.LocalStrategy = new LocalStrategy(
  {usernameField: 'email'},
  function(email, password, cb) {
      User.getByEmail(email)
          .then((user) => {
              if (!user) { 
                return cb(null, false) 
              }

              bcrypt.compare(password, user.password, (err, res) => {
                if (res) {
                  // passwords match! log user in
                  return cb(null, user)
                } else {
                  // passwords do not match!
                  return cb(null, false)
                }
              })
          })
          .catch((err) => {   
              cb(err);
          });
});

exports.serializeUser = function(user, cb) {
  cb(null, user._id.toString());
};

exports.deserializeUser = function(id, cb) {
  User.getBy_id(id)
  .then(user => {
    cb(null, user);
  })
  .catch(err => {
    return cb(err); 
  })
};