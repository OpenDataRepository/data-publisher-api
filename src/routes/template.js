const express = require('express');
const router = express.Router();

const { validateUuid, validateTimestamp, ensureLoggedIn } = require('../lib/middleware');
const templateController = require('../controllers/templateController');

router.get('/:uuid/draft', validateUuid, templateController.draft_get);
router.get('/:uuid/draft_existing', validateUuid, templateController.draft_existing);
router.get('/:uuid/latest_persisted', validateUuid, templateController.get_latest_persisted);
router.get('/persisted_version/:id', templateController.get_persisted_version);
router.get('/:uuid/last_update', ensureLoggedIn, validateUuid, templateController.get_last_update);
router.get('/:uuid/:timestamp', validateUuid, validateTimestamp, templateController.get_persisted_before_timestamp);
router.post('/', ensureLoggedIn, templateController.create);
router.put('/:uuid', ensureLoggedIn, validateUuid, templateController.update);
router.post('/:uuid/persist', ensureLoggedIn, validateUuid, templateController.persist);
router.delete('/:uuid/draft', ensureLoggedIn, validateUuid, templateController.draft_delete);
router.post('/:uuid/duplicate', ensureLoggedIn, validateUuid, templateController.duplicate);
// TODO: implement get template based on _id

module.exports = router;
