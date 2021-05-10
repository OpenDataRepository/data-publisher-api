var express       = require('express')
var debug         = require('debug')('setup')
var _             = require('underscore')
var env           = process.env.NODE_ENV
var config        = require(__dirname + '/../../config/config.json')[env]
var Promise       = require("bluebird")
// Require the mixins for custom Utilities
var httpstatus    = require('http-status')
var models        = require('../../models')
var User          = require('../../class_methods/user_methods')
var UserMeta      = require('../../class_methods/user_meta_methods')
var AclCustomer   = models.user_relationship
var AclRole       = models.role
var passport      = require('passport')
var jwt           = require('jwt-simple')
var acl           = require('../../lib/acl.init')
var uuid          = require('uuid')
var moment        = require('moment')

// FaceBook
var { FB, FacebookApiException } = require('fb');



exports.isLoggedIn = function(req,res) {
  res.status(httpstatus.OK)
  return res.end('Valid Login')
}

/**
 * listAllRoles - list all available roles
 *
 * @return [ acl_role ] array of roles
 */
exports.listAvailableRoles = function(req, res) {
  var isSuper = false;
  acl
    .hasRole(req.user.id, "super admin")
    .then(function(result) {
      if(result) {
        debug('Super Access Granted')
        isSuper = true;
      }
      return isSuper
    })
    .then(function(isSuper) {
      debug(isSuper)
      debug("Starting lookup")
      if(isSuper) {
        // Find all Users - Super Admin
        return  AclRole.findAll()
      }
      else {
        return AclRole
          .findAll({
            where: {
              acl_role_type: "user"
            }
          })
      }
    })
    .then(function(roles) {
      // User not found
      if(!_.isArray(roles)) {
        return res.sendStatus(httpstatus.NOT_FOUND)
      }
      else {
        debug(roles)

        return res.send(roles)
      }
    })
    .catch(function(err, userlist) {
      // Catch errors and send BAD_REQUEST
      debug("ERROR: " + err)
      return res.sendStatus(httpstatus.BAD_REQUEST)
    })

}

/**
 * showUserRoles - list roles for user.
 *
 * @param req
 * @param res
 * @return {undefined}
 */
exports.listRoles = function(req, res) {

  // TODO Need to check that user is a member
  // of company that the administrator administers

  var id = req.params.id
  acl
    .userRoles(id)
    .then(function(roles) {
      // Send the response of the user object.
      debug("Listing user roles")
      debug(roles)
      return res.send(roles)
    })
    // Catch errors and validation errors.
    .catch(function(err) {
      // Catch errors and send BAD_REQUEST
      debug("ERROR:")
      debug(err)
      return res.sendStatus(httpstatus.BAD_REQUEST)
    })
}

/**
 * addRole - adds roles to a user
 *
 * @param {integer}  [id] - The id of the user to add permissions/roles for.
 *
 * @return { user } RETURN OK/Failure
 */
exports.addRole = function(req, res) {

  debug(req.body.role)
  var isSuper = false;
  acl
    .hasRole(req.user.id, "super admin")
    .then(function(result) {
      if(result) {
        isSuper = true;
      }
      return isSuper
    })
    .then(function(isSuper) {
      if(isSuper) {
        // We can do anything
        return  User.find({
          where: {
            id: req.params.id
          }
        })
      }
      else {
        // Get Companies User is "Customer Admin" for.
        debug('Using customer-limited permissions')
        return AclCustomer
          .hasPermission(req.user.id, "customer admin", models)
          .then(function(customer_list) {
            // if roles contains "customer member" we can add that and all
            // additional roles
            var role_id = req.body.role
            return AclRole.find({
              where: {
                id: role_id
              }
            })
              .then(function(acl_role) {
                if(acl_role.acl_role == "customer member") {
                  return  User.find({
                    where: {
                      id: req.params.id
                    }
                  })
                }
                else {
                  // Find all users associated with customers for
                  // which this user has customer admin role.
                  return User.getUsersForCustomers("customer member", customer_list, models)
                }
              })
          })
          .then(function(userlist) {
            for(var i = 0; i < userlist.length; i++) {
              if(userlist[i].id == req.params.id) {
                return userlist[i]
              }
              if(i == (userlist.length - 1)) {
                // User was not found in list of users this
                // admin has access to (need to give the role
                // "customer member" to the user first to add
                // higher level permissions
                return res.sendStatus(httpstatus.NOT_FOUND)
              }
            }
          })
      }
    })
    .then(function(user) {
      // Adding redis/acl roles
      debug('adding acl roles')
      debug(req.body.role)
      return AclRole.find({
        where: {
          id: req.body.role
        }
      })
        .then(function(acl_role) {
          var roles = []
          roles.push(acl_role.acl_role)

          return acl
            .addUserRoles(user.id, roles)
        })
    })
    .then(function() {
      // Add user permissions for customer
      return AclCustomer.findOrCreate({
        where: {
          customer_id: req.body.customer,
          user_id: req.params.id,
          acl_role_id: req.body.role
        },
        defaults: {
          customer_id: req.body.customer,
          user_id: req.params.id,
          acl_role_id: req.body.role
        }
      })
    })
    .spread(function(created, acl_customer) {
      // get user object to return
      return User.getUserWithRoles(req.params.id, models)
    })
    .then(function(user) {
      // Return the user object
      res.send(user)
    })
    .catch(function(err) {
      // Catch errors and send BAD_REQUEST
      debug("ERROR: " + err)
      return res.sendStatus(httpstatus.BAD_REQUEST)
    })
}


exports.refreshRoles = function(req, res) {

  AclCustomer.findAll({
    include: [{ model: models.AclRole }]
  })
    .then(function(acl_customers) {
      // Set the redis/access roles

      var users = []
      acl_customers.forEach(function(acl_customer) {
        if(users[acl_customer.user_id] == undefined) {
          users[acl_customer.user_id] = []
        }
        users[acl_customer.user_id].push(acl_customer.AclRole.acl_role)
        users[acl_customer.user_id] = _.uniq(users[acl_customer.user_id])
      })

      var promises = []
      for(x in users) {
        // TODO Delete existing roles
        // Then refresh
        promises.push(acl.addUserRoles(x, users[x]))
      }
      return(Promise.all(promises))
    })
    .then(function() {
      return res.sendStatus(httpstatus.OK)
    })
    .catch(function(err) {
      // Catch errors and send BAD_REQUEST
      debug("ERROR: " + err)
      return res.sendStatus(httpstatus.BAD_REQUEST)
    })
}


/**
 * deleteRole - adds roles to a user
 *
 * @param {integer}  [id] - The id of the user to add permissions/roles for.
 *
 * @return { user } RETURN OK/Failure
 */
exports.deleteRole = function(req, res) {

  var isSuper = false;
  acl
    .hasRole(req.user.id, "super admin")
    .then(function(result) {
      debug('super check')
      if(result) {
        isSuper = true;
      }
      return isSuper
    })
    .then(function(isSuper) {
      if(isSuper) {
        debug('super')
        // We can do anything
        return  User.find({
          where: {
            id: req.params.user_id
          }
        })
      }
      else {
        // Get Companies User is "Customer Admin" for.
        debug('Using customer-limited permissions')
        return AclCustomer
          .hasPermission(req.user.id, "customer admin", models)
          .then(function(customer_list) {
            // Find all users associated with customers for
            // which this user has customer admin role.
            return User.getUsersForCustomers(customer_list, models)
          })
          .then(function(userlist) {
            for(var i = 0; i < userlist.length; i++) {
              if(userlist[i].id == req.params.user_id) {
                return userlist[i]
              }
              if(i == (userlist.length - 1)) {
                // User was not found in list of users this
                // admin has access to (need to give the role
                // "customer member" to the user first to add
                // higher level permissions
                return res.sendStatus(httpstatus.NOT_FOUND)
              }
            }
          })
      }
    })
    .then(function() {
      // Add user permissions for customer
      // If Role is member, destory all
      return AclRole.find({ where: { id: req.params.role_id }})
    })
    .then(function(acl_role) {
      if(acl_role.acl_role == "customer member") {
        return AclCustomer.destroy({
          where: {
            customer_id: req.params.customer_id,
            user_id: req.params.user_id,
          }
        })
      }
      else {
        return AclCustomer.destroy({
          where: {
            customer_id: req.params.customer_id,
            user_id: req.params.user_id,
            acl_role_id: req.params.role_id
          }
        })
      }
    })
    .then(function() {
      // Get distinct roles for user
      return AclCustomer.findAll({
        where: {
          user_id: req.params.user_id,
        },
        include: [{ model: models.AclRole }]
      })
    })
    .then(function(acl_customer) {
      // Set the redis/access roles
      var roles = []
      for(var i=0; i < acl_customer.length; i++) {
        roles.push(acl_customer[i].AclRole.acl_role)
      }
      roles = _.uniq(roles)

      // TODO Delete existing roles
      return acl
        .addUserRoles(req.params.user_id, roles)
    })
    .then(function() {
      // get user object to return
      // TODO Limit to users admin has rights to
      // Could leak role information
      return User.getUserWithRoles(req.params.user_id, models)
    })
    .then(function(user) {
      // Return the user object
      res.send(user)
    })
    .catch(function(err) {
      // Catch errors and send BAD_REQUEST
      debug("ERROR: " + err)
      return res.sendStatus(httpstatus.BAD_REQUEST)
    })
}



// used to serialize the user for the session
passport.serializeUser(function(user, done) {
  done(null, user)
})

// used to deserialize the user
passport.deserializeUser(function(user, done) {
  debug("Will this fire?")
  User
    .findOne({where: {id: user.id}})
    .then(function(user) {
      debug("Deserialize user found.")
      debug(found_user.get({
        plain: true
      }))
      // Add userId field to comply with
      // node-acl middleware requirements.
      // acl.middleware() checks for userId
      // in session object
      user.id = found_user.id
      done(null, user)
    })
    .catch(function(err, user) {
      debug("Deserialize error.")
      done(err, user)
    })

})


/*
 * Bearer strategy for token authentication when accessing API endpoints
 */
var BearerStrategy = require('passport-http-bearer')
passport.use(new BearerStrategy(
  function(token, done){
    try {
      // We attempt to decode the token the user sends with his requests
      var token = jwt.decode(token, config.jwt_opts.secret)

      console.log("TOKEN = " + JSON.stringify(token));

      //TODO: must check the token expiry and ensure the token is still valid
      if((_.now() - token.timestamp)/1000 > config.jwt_opts.session_length) {
        //if token is expired return 401! (throw an exception, will be caught by catch clause)
        debug("Expired session.")
        throw new Error("Expired session.")
      }

      debug(token)
      //we find the user that has made the request
      User
        .findOne({where: {id: token.id}})
        .then(function(user) {
          debug("User found from token.")
          debug(user.get({
            plain: true
          }))
          done(null, user)
        })
    }
    catch(err){
      return done(null, false) //returns a 401 to the caller
    }
  }
))

/*
var FacebookStrategy = require('passport-facebook')
passport.use('facebookstrategy',new FacebookStrategy({
    clientID: config.facebook_app_id,
    clientSecret: config.facebook_app_secret,
    callbackURL: "http://localhost:3000/v01/auth/facebook/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    return User.findOrCreate({
      where: {
        username: profile.emails[0].value
      },
      defaults: {
        username: profile.emails[0].value,
        password: token,
        active: 1
      }
    }).spread( function (user, created) {
      return UserMeta.findOrCreate({
        where: {
          user_id: user.id
        },
        defaults: {
          user_email: user.username,
          password: token,
          first_name: profile.name.givenName,
          last_name: profile.name.familyName,
          user_id: user.id,
          created_by_user_id: user.id,
          google_id: profile.id
        }
      })
        .spread( function (user_meta, created) {
          return done(null, {user: user, user_meta: user_meta})
        })
        .catch(function (error) {
          return done(error)
        })

    })
      .catch(function (err) {
        return done(err)
      })
  }
));
*/

// Google OAuth 2.0
//
// OAuth 2.0 is set up using systems@stoneumbrella.com
// Credentials can be managed using that account.
//
// Credentials are stored in the config.json file.
/*
var GoogleStrategy = require('passport-google-oauth20').Strategy

passport.use('googlestrategy', new GoogleStrategy({
    clientID: config.google_consumer_key, // GOOGLE_CONSUMER_KEY,
    clientSecret: config.google_consumer_secret, //  GOOGLE_CONSUMER_SECRET,
    callbackURL: "http://localhost:3000/v01/auth/google/callback"
  },
  function(token, refreshToken, profile, done) {
    return User.findOrCreate({
        where: {
          username: profile.emails[0].value
        },
        defaults: {
          username: profile.emails[0].value,
          password: token,
          active: 1
        }
      }).spread( function (user, created) {
        return UserMeta.findOrCreate({
          where: {
            user_id: user.id
          },
          defaults: {
            user_email: user.username,
            password: token,
            first_name: profile.name.givenName,
            last_name: profile.name.familyName,
            user_id: user.id,
            created_by_user_id: user.id,
            google_id: profile.id
          }
        })
          .spread( function (user_meta, created) {
            return done(null, {user: user, user_meta: user_meta})
          })
          .catch(function (error) {
            return done(error)
          })

    })
      .catch(function (err) {
        return done(err)
      })
  }
))

exports.googleAuthenticate = function (req, res, next) {
  return passport.authenticate('google')
}

exports.googleConfirmAuthenticate = function (req, res, next) {
  debug('in here')
  return passport.authenticate('google', {failureRedirect: '/login'}),
    function (req, res) {
      return res.redirect('/')
    }
}
*/

let GoogleValidator = require('passport-local').Strategy
passport.use('googleValidator', new GoogleValidator(
  function(google_user_data, callback) {

    // Check token is for this app....
    // Google Check  -- https://www.npmjs.com/package/googleapis  ???
    // https://stackoverflow.com/questions/359472/how-can-i-verify-a-google-authentication-api-access-token
    // https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=<access_token>



    // Verify valid token with appropriate system (facebook/google)

    // Check if user exists in DB with these ids

    // Create user if not exists

    // Return User







    debug("LOCAL User Search: " + username + " == " + password)
    User.findOne({
      where: {username: username},
      include: [
        {
          model: UserMeta,
          as: 'user_meta_user_id'
        }
      ]
    })
      .then(function (user) {

        // No user found with that username
        if (!user) {
          debug("LOCAL Error: User not found.")
          return callback(null, false)
        }
        debug("LOCAL User Found: " + username + " == " + password)

        // Make sure the password is correct
        User.verifyPassword(user, password, function(err, isMatch) {
          if (err) {
            debug("Basic ERROR: " + err)
            return callback(err)
          }

          // Password did not match
          if (!isMatch) {
            debug('LOCAL User Authentication failure.')
            return callback(null, false)
          }

          // Success
          debug('LOCAL User Authenticated.')
          return callback(null, user)
        })
      })
      .catch(function(err, user) {
        // Catch errors and return
        debug("LOCAL Authentication error")
        return callback(err)
      })
  }
))

let FacebookValidator = require('passport-local').Strategy
passport.use('facebookValidator', new FacebookValidator(
  {
    passReqToCallback: true,
    session: false
  },
  function(req, username, password, callback) {

    let fb_user_data = req.body.fb_user_data
    debug('using facebook validator (internals)')
    // Check token is for this app....
    // Using https://www.npmjs.com/package/fb
    // https://stackoverflow.com/questions/14543882/verify-facebook-access-token-for-specific-app
    return FB.api('app/?access_token=' + fb_user_data.access_token, function (res) {
      if(!res || res.error) {
        debug(!res ? 'error occurred' : res.error);
        return callback(res.error)
      }

      if(res.name === "Chirrp Golf" && res.id === "2142604142660313") {
        // Check if user exists in DB with these ids
        return User.findOne({
          include: [
            {
              model: UserMeta,
              as: 'user_meta_user_id',
              where: {
                facebook_id: fb_user_data.id
              },
            }
          ]
        })
          .then(function (user) {

            // No user found with that username
            if (!user) {
              // Create user if not exists
              debug("FaceBOok Error: User not found.")

              let user = {};
              user.username = fb_user_data.email
              user.password = uuid.v4()
              user.active = 1
              user.verified = moment()

              let user_meta = {}
              user_meta.user_email = fb_user_data.email
              user_meta.nickname = fb_user_data.username
              user_meta.first_name = fb_user_data.first_name
              user_meta.last_name = fb_user_data.last_name
              user_meta.facebook_id = fb_user_data.id


              return User.add(user, user_meta)
                .then(
                  (new_user) => {
                    // Login new user
                    debug('FaceBook User Authenticated.')
                    // Return User
                    return callback(null, new_user)
                  }
                )
            }
            else {
              // Return User
              return callback(null, user)
            }
          })
          .catch(function(err, user) {
            // Catch errors and return
            debug("LOCAL Authentication error")
            return callback(err)
          })

      }

    });

  }
))



// load all the things we need
var LocalStrategy = require('passport-local').Strategy
passport.use('localStrategy', new LocalStrategy(
  function(username, password, callback) {
    debug("LOCAL User Search: " + username + " == " + password)
    User.findOne({
      where: {username: username},
      include: [
        {
          model: UserMeta,
          as: 'user_meta_user_id'
        }
      ]
    })
      .then(function (user) {

        // No user found with that username
        if (!user) {
          debug("LOCAL Error: User not found.")
          return callback(null, false)
        }
        debug("LOCAL User Found: " + username + " == " + password)

        // Make sure the password is correct
        User.verifyPassword(user, password, function(err, isMatch) {
          if (err) {
            debug("Basic ERROR: " + err)
            return callback(err)
          }

          // Password did not match
          if (!isMatch) {
            debug('LOCAL User Authentication failure.')
            return callback(null, false)
          }

          // Success
          debug('LOCAL User Authenticated.')
          return callback(null, user)
        })
      })
      .catch(function(err, user) {
        // Catch errors and return
        debug("LOCAL Authentication error")
        return callback(err)
      })
  }
))

// Basic authentication strategy.  User credentials
// are passed via the URL for direct API access
var BasicStrategy = require('passport-http').BasicStrategy
passport.use('basic-auth', new BasicStrategy(
  function(username, password, callback) {
    debug("BASIC User Search: " + username + " == " + password)
    User.findOne({
      where: {username: username},
      include: [
        {
          model: UserMeta,
          as: 'user_meta_user_id'
        }
      ]
    })
      .then(function(user) {
        // No user found with that username
        if (!user) {
          debug("Error: User not found.")
          return callback(null, false)
        }
        debug("BASIC User Found: " + username + " == " + password)

        // Make sure the password is correct
        User.verifyPassword(user, password, function(err, isMatch) {
          if (err) {
            debug("Basic Authentication Error: " + err)
            return callback(err)
          }

          // Password did not match
          if (!isMatch) {
            debug('BASIC User Authentication failure.')
            return callback(null, false)
          }

          // Success
          debug('BASIC User Authenticated.')
          return callback(null, user)
        })
      })
      .catch(function(err, user) {
        // Catch errors and return
        debug("BASIC Authentication error: " + err)
        return callback(err)
      })
  }
))

exports.logout = function(req,res,next) {
  req.session.destroy()
  // req.logout()
  res.status(httpstatus.OK)
  return res.end('Please Login')
}



exports.verifylogin = function(req, res, next) {
  debug("Starting login using local strategy.")

  if(req.body.fb_user_data !== undefined) {
    req.body.username = 'TEST USER';
    req.body.password = 'TESTPass';
    debug("FB User Data: ", req.body.fb_user_data)
    return passport.authenticate(
      'facebookValidator',
      {
        session: false
      },
      function (err, user) {
        if(err) {
          debug('ERROR:::', err)
        }
        debug('FaceBook strategy user auth.')
        if(user === undefined || _.isEmpty(user)) {
          debug("facebook user is undefined")
          res.status(httpstatus.UNAUTHORIZED)
          return res.end('Please Login')
        }
        else {

          req.logIn(user, function() {
            // User has authenticated correctly thus we create a JWT token
            // Use timestamp to set session length.  Length (seconds) stored in
            // app config.json.
            var token = jwt.encode(
              {
                id: user.id,
                timestamp: _.now(),
              },
              config.jwt_opts.secret
            )
            user.password = '' // Unset the password to minimize data leaks
            var login_data = { user: user, token: token }
            res.status(err ? 500 : 200).send(err ? err : login_data)
          })
        }
      }
    )(req,res,next)
  }
  else {
    return passport.authenticate(
      'localStrategy',
      // Sessions are off - local only used for initial token creation.
      {session: false},
      function (err, user) {
        debug('Local strategy user auth.')
        if (user === undefined || _.isEmpty(user)) {
          debug("user is undefined")
          res.status(httpstatus.UNAUTHORIZED)
          return res.end('Please Login')
        }
        else {

          req.logIn(user, function () {
            // User has authenticated correctly thus we create a JWT token
            // Use timestamp to set session length.  Length (seconds) stored in
            // app config.json.
            var token = jwt.encode(
              {
                id: user.id,
                timestamp: _.now(),
              },
              config.jwt_opts.secret
            )
            user.password = '' // Unset the password to minimize data leaks
            var login_data = {user: user, token: token}
            res.status(err ? 500 : 200).send(err ? err : login_data)
          })
        }
      }
    )(req, res, next)
  }
}

exports.isAuthenticated = function(req,res,next) {
  if ( !req.isAuthenticated() ) {
    debug("NOT Authenticated.")

    // check header or url parameters or post parameters for token
    // var token = req.body.token || req.query.token || req.headers['x-access-token'];

    // decode token
    // if (!token) {
    if (req.headers && req.headers.authorization) {
      debug("Attempting bearer/token/jwt authentication.")
      // verifies token and returns user
      return passport.authenticate(
        'bearer',
        { session : false },
        // Custom callback to modify response headers to
        // prevent browsers from prompting users for
        // basic credentials.
        function(err, user) {
          if(!user){
            // Fallback to basic authentication.
            return passport.authenticate(
              'basic-auth',
              { session : false },
              // Custom callback to modify response headers to
              // prevent browsers from prompting users for
              // basic credentials.
              function(err, user) {
                if(err) {
                  debug("Error: " + err)
                }

                if(!user){
                  // Send a modified www-authenticate header to
                  // prevent user's browser from prompting for
                  // basic login credentials when user is not
                  // found.
                  debug('Sending modified authenticate headers')
                  res.set('WWW-Authenticate', 'xNOLogin')
                  res.status(httpstatus.UNAUTHORIZED)
                  return res.end('Please Login')
                }
                req.login(user, function(err){
                  // Log user in and call return function.
                  if(err) {
                    debug('Login failure.')
                    res.status(httpstatus.UNAUTHORIZED)
                    return res.end('Login failure.')
                  }
                  // Add user object to request (req)
                  req.user = user
                  checkACL(req, res, next)
                })
              }
            )(req, res, next)
            // res.status(httpstatus.UNAUTHORIZED)
            // return res.end('Please Login')
          }
          req.login(user, function(err){
            // Log user in and call return function.
            if(err) {
              debug('Login failure.')
              res.status(httpstatus.UNAUTHORIZED)
              return res.end('Login failure.')
            }
            // Add user object to request (req)
            req.user = user
            checkACL(req, res, next)
          })
        }
      )(req, res, next)
    }
    else {
      debug('Login failure - no auth headers present.')
      res.status(httpstatus.UNAUTHORIZED)
      return res.end('Please log in.')
    }
  }                                   // as opposed to an SPA
  else if (req.isAuthenticated()) {
    debug("Authenticated by session.")
    return next()
  }
  else {
    res.status(httpstatus.UNAUTHORIZED)
    return res.end('Please Login')
  }
}



function checkACL(req, res, next) {
  debug('User logged in.')
  debug('Running acl middleware.')
  debug("Request Method:")
  debug(req.method)
  debug("User ID:")
  debug(req.user.id)
  // User added to request during login process. Only persists
  // for duration of current request.
  // req.baseURL must be stripped of leading slash to work with
  // acl functions.
  var acl_path = req.baseUrl.replace(/^\//,'') + req.route.path
  acl_path = acl_path.replace(/\/$/,'')
  // var acl_path = req.baseUrl.replace(/^\//,'') + req.path
  debug("ACL Path:")
  debug(acl_path)
  acl.userRoles(req.user.id)
    .then(function(roles) {
      // TODO Remove this before go live
      debug("ROLES")
      debug(roles)
      acl.isAllowed(req.user.id, acl_path, req.method.toLowerCase())
        .then(function(result) {
          if(result) {
            debug('ACL Access Granted')
            debug(result)
            return next()
          } else {
            debug('ACL Access denied.')
            debug(result)
            res.status(httpstatus.FORBIDDEN)
            return res.end('You do not have access to this resource.')
          }
        })
    })
}

/**
 * addRole - adds roles to a user
 *
 * @param {integer}  [id] - The id of the user to add permissions/roles for.
 *
 * @return { user } RETURN OK/Failure
 */
exports.addRoleSetup = function(req, res) {

  debug(req.body.role)
  var isSuper = false;
  User.find({
    where: {
      id: req.params.id
    }
  })
    .then(function(user) {
      // Adding redis/acl roles
      debug('adding acl roles')
      var roles = []
      roles.push(req.body.role)

      return acl
        .addUserRoles(req.params.id, roles)
    })
    /*
  .then(function() {
    // Add user permissions for customer
    return AclCustomer.findOrCreate({
      where: {
        customer_id: req.body.customer,
        user_id: req.params.id,
        acl_role_id: req.body.role
      },
      defaults: {
        customer_id: req.body.customer,
        user_id: req.params.id,
        acl_role_id: req.body.role
      }
    })
  })
  .spread(function(created, acl_response) {
    // get user object to return
    return User.getUserWithRoles(req.params.id, models)
  })
    */
    .then(function() {
      debug('acl = ' + acl)
      return  acl.userRoles(req.params.id)
    })
    .then(function(roles) {
      debug(roles)
      return res.send(roles)
    })
    .catch(function(err) {
      // Catch errors and send BAD_REQUEST
      debug("ERROR: " + err)
      return res.sendStatus(httpstatus.BAD_REQUEST)
    })

}
