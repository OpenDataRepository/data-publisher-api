const express = require('express');
const router = express.Router();

const controller = require('../controllers/permissionGroupController');

router.get('/:uuid/:category', controller.get);
router.put('/:uuid/:category', controller.update);
// This route exists only for the purpose of testing
router.post('/:uuid/testing_initialize', controller.testing_initialize);

module.exports = router;
