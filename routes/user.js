var express = require('express');
const req = require('express/lib/request');
var router = express.Router();
const userController = require('../controllers/userController')
const { ensureLoggedIn, ensureAdminOrSuper } = require('../lib/middleware');


// TODO: rename 'user' to 'account'

router.post('/register', userController.register);
router.post('/confirm_email/:token', userController.confirm_email);
router.post('/login', userController.login);

router.post('/suspend', ensureLoggedIn, userController.suspend);
router.post('/update', ensureLoggedIn, userController.update);
router.post('/change_email', ensureLoggedIn, userController.change_email);
router.get('', ensureLoggedIn, userController.get);
router.get('/permissions', ensureLoggedIn, userController.getPermissions);

router.post('/other_user/:email/suspend', ensureLoggedIn, ensureAdminOrSuper, userController.suspend_other_user);
router.post('/other_user/:email/update', ensureLoggedIn, ensureAdminOrSuper, userController.update_other_user);
router.post('/other_user/:email/change_email', ensureLoggedIn, ensureAdminOrSuper, userController.change_other_user_email);
router.get('/other_user/:email', ensureLoggedIn, ensureAdminOrSuper, userController.get);
router.get('/other_user/:email/permissions', ensureLoggedIn, ensureAdminOrSuper, userController.getPermissions);

if(process.env.is_test) {
  router.get('/test-unprotected-route', (req, res, next) => {
    res.sendStatus(200);
  });
  router.post('/testing_set_admin', ensureLoggedIn, userController.testing_set_admin);
  router.post('/testing_set_super', ensureLoggedIn, userController.testing_set_super);
}


module.exports = router;