const express = require('express');
const router = express.Router();

const { validateUuid, validateTimestamp, ensureLoggedIn, getUserFromToken } = require('../lib/middleware');
const controller = require('../controllers/recordController');

router.get('/:uuid/draft', ensureLoggedIn(), validateUuid, controller.draft_get);
router.get('/:uuid/draft_existing', getUserFromToken, validateUuid, controller.draft_existing);
router.get('/:uuid/latest_persisted', getUserFromToken, validateUuid, controller.get_latest_persisted);
router.get('/:uuid/last_update', ensureLoggedIn(), validateUuid, controller.get_last_update);
router.get('/:uuid/:timestamp', getUserFromToken, validateUuid, validateTimestamp, controller.get_persisted_before_timestamp);
router.post('/', ensureLoggedIn(), controller.create);
router.put('/:uuid', ensureLoggedIn(), validateUuid, controller.update);
router.post('/:uuid/persist', ensureLoggedIn(), validateUuid, controller.persist);
router.delete('/:uuid/draft', ensureLoggedIn(), validateUuid, controller.draft_delete);

module.exports = router;
