var express = require('express');
var router = express.Router();
const userController = require('../controllers/userController')

router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/logout', userController.logout);

// TODO: add update and delete

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