var express = require('express');
var router = express.Router();
const userController = require('../controllers/userController')
const { ensureLoggedIn } = require('../lib/middleware');

router.post('/register', userController.register);
router.get('/confirm_email/:token', userController.confirm_email);
router.post('/login', userController.login);

router.post('/suspend', ensureLoggedIn, userController.suspend);
router.post('/update', ensureLoggedIn, userController.update);
router.post('/change_email', ensureLoggedIn, userController.change_email);
router.get('', ensureLoggedIn, userController.get);
router.get('/permissions', ensureLoggedIn, userController.getPermissions);
router.get('/datasets', ensureLoggedIn, userController.getDatasets)


if(process.env.is_test) {
  router.get('/test-unprotected-route', (req, res, next) => {
    res.sendStatus(200);
  });
  router.post('/testing_set_admin', ensureLoggedIn, userController.testing_set_admin);
  router.post('/testing_set_super', ensureLoggedIn, userController.testing_set_super);
}


module.exports = router;