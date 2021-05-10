const debug = require('debug')('setup');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const {Connection} = require('../lib/mongo_connection');
const User = require('../models/user_model');
const jwt = require('jsonwebtoken');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const env = process.env.NODE_ENV || 'production';
const config = require(__dirname + '/../config/config.json')[env];

passport.use(new OAuth2Strategy({
    authorizationURL: config.passport.authorizationURL,
    tokenURL: config.passport.tokenURL,
    clientID: config.passport.clientID,
    clientSecret: config.passport.clientSecret,
    callbackURL: config.passport.callbackURL
  },
  function(accessToken, refreshToken, profile, cb) {
    // Pretty sure this will never get called
    User.findOne({ 'wordpress.id' : profile.id }, function(err, user) {
      // if there are any errors, return the error before anything else
      if (err)
        return done(err);

      // if no user is found, return the message
      if (!user) {
        // Create user
        let newUser            = new User();
        newUser.wordpress.token.access_token = accessToken;
        newUser.wordpress.token.refresh_token = refreshToken;
        newUser.wordpress.user_login = profile.user_login;
        newUser.wordpress.full_name  = profile.user_nicename;
        newUser.wordpress.display_name  = profile.display_name;
        newUser.wordpress.user_status = profile.user_status;
        newUser.wordpress.user_email = profile.user_email;
        newUser.wordpress.user_registered = profile.user_registered;
        // save our user to the database
        newUser.save(function(err) {
          if (err)
            throw err;

          // if successful, return the new user
          return done(null, newUser);
        });
      }
      else {
        // Update user with latest info
        user.wordpress.token.access_token = accessToken;
        user.wordpress.token.refresh_token = refreshToken;
        user.wordpress.user_login = profile.user_login;
        user.wordpress.full_name  = profile.user_nicename;
        user.wordpress.display_name  = profile.display_name;
        user.wordpress.user_status = profile.user_status;
        user.wordpress.user_email = profile.user_email;
        user.wordpress.user_registered = profile.user_registered;
        user.save(function(err) {
          if (err)
            throw err;
          return done(null, user);
        });
      }

    });
  }
));


var opts = {};
opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
opts.secretOrKey = config.jwt_opts.secretOrKey;
opts.issuer = config.jwt_opts.issuer;
opts.audience = config.jwt_opts.audience;
opts.maxAge = config.jwt_opts.maxAge;
getUser = async function(id, next) {
  const user_collection = Connection.db.collection(User.collection_name);

  try {
    let theUser = await user_collection
      .findOne({"wordpress.id": id});
    // User.findOne({"wordpress.id": id});

    if (theUser) {
      debug('User found');
      debug(theUser);
      return next(null, theUser);
    } else {
      return next(null, false);
    }
  } catch (e) {
    return next(err, false);
  }
};

passport.use(new JwtStrategy(opts, function(jwt_payload, next) {
  return getUser(jwt_payload.user._id, next)
  // return next(null, jwt_payload.user._id);
}));

