var express = require('express');
var router = express.Router();
const userController = require('../controllers/userController')
const {ensureLoggedIn} = require('../lib/middleware');


// TODO: rename 'user' to 'account'

router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/logout', ensureLoggedIn, userController.logout);

router.post('/delete', ensureLoggedIn, userController.delete);
router.post('/update', ensureLoggedIn, userController.update);
router.get('', ensureLoggedIn, userController.get);
router.get('/documents', ensureLoggedIn, userController.getPermissions);

router.get('/test-unprotected-route', (req, res, next) => {
  res.sendStatus(200);
});


module.exports = router;