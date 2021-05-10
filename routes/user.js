var express = require('express');
var router = express.Router();
const passport = require('passport');
require('../config/config.passport');
var UserController = require('../controllers/user_controller');

/* GET users listing. */
router.get('/login', passport.authorize('oauth2'), UserController.loginUser);
router.get('/code', UserController.processAuthCode);
router.get('/testNoAuth', UserController.apiTest);
router.get('/test',
  passport.authenticate('jwt', { session: false }
    /*
    function (error, user, info) {
      // this will execute in any case, even if a passport strategy will find an error
      // log everything to console
      console.log("ERROR:  ");
      console.log(error);
      console.log("USER:  ");
      console.log(user);
      console.log("INFO:  ");
      console.log(info);
    }
     */
    ),
  UserController.apiTest);
router.get('/me', passport.authorize('oauth2', {session: false}), UserController.me);

module.exports = router;
