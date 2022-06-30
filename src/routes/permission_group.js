const express = require('express');
const router = express.Router();

// TODO: rename permission_group to permission

const { validateUuid, ensureLoggedIn } = require('../lib/middleware');
const controller = require('../controllers/permissionGroupController');

router.get('/:uuid/:category', validateUuid, controller.get);
router.put('/:uuid/:category', ensureLoggedIn, validateUuid, controller.update);
// This route exists only for the purpose of testing
if(process.env.is_test) {
  router.post('/:uuid/:category/testing_has_permission', validateUuid, controller.testing_has_permission);
}

module.exports = router;
