var express = require('express');
var router = express.Router();
const bcrypt = require ("bcryptjs");
var passport = require('passport');
const User = require('../models/user');

// TODO: move all of the implementation here into the user controller

router.post('/register', (req, res, next) => {

  bcrypt.hash(req.body.password, 10, (err, hashedPassword) => {
    // if err, do something
    // otherwise, store hashedPassword in DB
    if(err) {
      return next(err);
    } else {
      User.create(req.body.username, hashedPassword)
      .then(() => {
        res.sendStatus('200');
      })
      .catch(err => {
        if(err.message == "Username already exists") {
          res.status(400).send("Username already exists");
        } else {
          return next(err);
        }
      });
    }
  });
});

router.post('/login', (req, res, next) => {
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
  }
);

router.post('/logout', (req, res, next) => {
  req.logout();
  res.sendStatus(200);
});

router.get('/test-protected-route', (req, res, next) => {
  if (req.isAuthenticated()) {
      res.sendStatus(200);
  } else {
      res.sendStatus(401);
  }
});

router.get('/test-unprotected-route', (req, res, next) => {
  res.sendStatus(200);
});



module.exports = router;