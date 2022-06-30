var express = require('express');
var router = express.Router();
const userController = require('../controllers/userController')
const { ensureLoggedIn, ensureAdminOrSuper } = require('../lib/middleware');

router.post('/:email/suspend', ensureLoggedIn, ensureAdminOrSuper, userController.suspend_other_user);
router.post('/:email/update', ensureLoggedIn, ensureAdminOrSuper, userController.update_other_user);
router.post('/:email/change_email', ensureLoggedIn, ensureAdminOrSuper, userController.change_other_user_email);
router.get('/:email', ensureLoggedIn, ensureAdminOrSuper, userController.get);
router.get('/:email/permissions', ensureLoggedIn, ensureAdminOrSuper, userController.getPermissions);

if(process.env.is_test) {
  router.get('/test-unprotected-route', (req, res, next) => {
    res.sendStatus(200);
  });
  router.post('/testing_set_admin', ensureLoggedIn, userController.testing_set_admin);
  router.post('/testing_set_super', ensureLoggedIn, userController.testing_set_super);
}

module.exports = router;