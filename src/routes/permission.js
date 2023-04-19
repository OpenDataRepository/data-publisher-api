const express = require('express');
const router = express.Router();

const { validateUuid, ensureLoggedIn } = require('../lib/middleware');
const controller = require('../controllers/permissionController');

router.get('/:uuid/:permission_level', validateUuid, controller.get_document_permissions);
router.put('/:uuid/:permission_level', ensureLoggedIn, validateUuid, controller.update_document_permissions);
router.get('/current_user_has_permission/:uuid/:permission_level', validateUuid, controller.current_user_has_permission);

module.exports = router;
