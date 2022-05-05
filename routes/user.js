var express = require('express');
var router = express.Router();
const userController = require('../controllers/userController')

// TODO: rename 'user' to 'account'

router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/logout', userController.logout);

router.post('/delete', userController.delete);
router.post('/update', userController.update);
router.get('', userController.get);

router.get('/test-unprotected-route', (req, res, next) => {
  res.sendStatus(200);
});


module.exports = router;