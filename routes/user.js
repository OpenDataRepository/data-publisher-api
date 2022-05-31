var express = require('express');
const req = require('express/lib/request');
var router = express.Router();
const userController = require('../controllers/userController')
const {ensureLoggedIn} = require('../lib/middleware');


// TODO: rename 'user' to 'account'

router.post('/register', userController.register);
router.post('/confirm_email/:token', userController.confirm_email);
router.post('/login', userController.login);
// router.post('/logout', ensureLoggedIn(), userController.logout);

router.post('/delete', ensureLoggedIn, userController.delete);
router.post('/update', ensureLoggedIn, userController.update);
router.post('/change_email', ensureLoggedIn, userController.change_email);
router.get('', ensureLoggedIn, userController.get);
router.get('/documents', ensureLoggedIn, userController.getPermissions);

if(process.env.is_test) {
  router.get('/test-unprotected-route', (req, res, next) => {
    res.sendStatus(200);
  });
  router.post('/testing_set_admin', ensureLoggedIn, userController.testing_set_admin);
  router.post('/testing_set_super', ensureLoggedIn, userController.testing_set_super);
}


module.exports = router;