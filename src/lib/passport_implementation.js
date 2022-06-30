// const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const jwt = require("jsonwebtoken");
// const User = require('../models/user');

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.ACCESS_TOKEN_SECRET
};

// exports.JWTStrategy = new JwtStrategy(options, function(jwt_payload, cb) {
//   // We will assign the `sub` property on the JWT to the database ID of user
//   User.getBy_id(jwt_payload.sub)
//   .then((user) => {
//       if (user) { 
//         return cb(null, user) 
//       } else {
//         return cb(null, false) 
//       }
//   })
//   .catch((err) => {   
//       cb(err);
//   });
  
// });

exports.issueJWT = function(user_id) {
  const expiresIn = '1h';

  const payload = {
    sub: user_id,
    iat: Date.now()
  };

  const signedToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: expiresIn });

  return {
    token: "Bearer " + signedToken,
    expires: expiresIn
  }
}