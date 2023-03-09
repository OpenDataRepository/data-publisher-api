const express = require('express');
const router = express.Router();

const { validateUuid, validateTimestamp, ensureLoggedIn } = require('../lib/middleware');
const controller = require('../controllers/recordController');

router.get('/:uuid/draft', ensureLoggedIn, validateUuid, controller.draft_get);
router.get('/:uuid/draft_existing', validateUuid, controller.draft_existing);
router.get('/:uuid/new_draft_from_latest_persisted', ensureLoggedIn, validateUuid, controller.new_draft_from_latest_persisted);
router.get('/:uuid/latest_persisted', validateUuid, controller.get_latest_persisted);
router.get('/:uuid/last_update', ensureLoggedIn, validateUuid, controller.get_last_update);
router.get('/:uuid/:timestamp', validateUuid, validateTimestamp, controller.get_persisted_before_timestamp);
router.post('/', ensureLoggedIn, controller.create);
router.put('/:uuid', ensureLoggedIn, validateUuid, controller.update);
router.post('/:uuid/persist', ensureLoggedIn, validateUuid, controller.persist);
router.delete('/:uuid/draft', ensureLoggedIn, validateUuid, controller.draft_delete);
// TODO: add an endpoint to set a record and all of it's sub-records to a given public date

module.exports = router;
