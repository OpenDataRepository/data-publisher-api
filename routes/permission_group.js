const express = require('express');
const router = express.Router();

// TODO: rename permission_group to permission

const {validateUuid} = require('../lib/middleware');
const controller = require('../controllers/permissionGroupController');

router.get('/:uuid/:category', validateUuid, controller.get);
router.put('/:uuid/:category', validateUuid, controller.update);
// This route exists only for the purpose of testing
router.post('/:uuid/testing_initialize', validateUuid, controller.testing_initialize);
router.post('/:uuid/:category/testing_has_permission', validateUuid, controller.testing_has_permission);

module.exports = router;
