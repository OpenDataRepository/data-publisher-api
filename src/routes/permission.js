const express = require('express');
const router = express.Router();

const { validateUuid, ensureLoggedIn } = require('../lib/middleware');
const controller = require('../controllers/permissionController');

router.get('/:uuid/:permission_level', validateUuid, controller.get_document_permissions);
router.put('/:uuid/:permission_level', ensureLoggedIn, validateUuid, controller.update_document_permissions);

module.exports = router;
