const express = require('express');
const router = express.Router();

// TODO: rename permission_group to permission

const { validateUuid, ensureLoggedIn, getUserFromToken } = require('../lib/middleware');
const controller = require('../controllers/permissionGroupController');

router.get('/:uuid/:category', getUserFromToken, validateUuid, controller.get);
router.put('/:uuid/:category', ensureLoggedIn(), validateUuid, controller.update);
// This route exists only for the purpose of testing
router.post('/:uuid/:category/testing_has_permission', getUserFromToken, validateUuid, controller.testing_has_permission);

module.exports = router;
