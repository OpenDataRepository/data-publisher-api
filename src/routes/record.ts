const express = require('express');
const router = express.Router();

const { validateUuid, validateTimestamp, ensureLoggedIn } = require('../lib/middleware');
const {recordController} = require('../controllers/recordController');

router.get('/:uuid/draft', ensureLoggedIn, validateUuid, recordController.draft);
router.get('/:uuid/draft_existing', validateUuid, recordController.draftExisting);
router.get('/:uuid/new_draft_from_latest_persisted', ensureLoggedIn, validateUuid, recordController.newDraftFromLatestPersisted);
router.get('/:uuid/latest_persisted', validateUuid, recordController.latestPersisted);
router.get('/:uuid/last_update', ensureLoggedIn, validateUuid, recordController.lastUpdate);
router.get('/:uuid/:timestamp', validateUuid, validateTimestamp, recordController.persistedBeforeTimestamp);
router.post('/', ensureLoggedIn, recordController.create);
router.put('/:uuid', ensureLoggedIn, validateUuid, recordController.update);
router.post('/:uuid/persist', ensureLoggedIn, validateUuid, recordController.persist);
router.delete('/:uuid/draft', ensureLoggedIn, validateUuid, recordController.deleteDraft);
// TODO: add an endpoint to set a record and all of it's sub-records to a given public date

export = router;
