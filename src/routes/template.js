const express = require('express');
const router = express.Router();

const { validateUuid, validateTimestamp, ensureLoggedIn } = require('../lib/middleware');
const {templateController} = require('../controllers/templateController');

router.get('/:uuid/draft', validateUuid, templateController.draft);
router.get('/:uuid/draft_existing', validateUuid, templateController.draftExisting);
router.get('/:uuid/latest_persisted', validateUuid, templateController.latestPersisted);
router.get('/version/:id', templateController.version);
router.get('/persisted_version/:id', templateController.persistedVersion);
if(process.env.is_test) {
  router.get('/:uuid/last_update', ensureLoggedIn, validateUuid, templateController.lastUpdate);
}
router.get('/:uuid/:timestamp', validateUuid, validateTimestamp, templateController.persistedBeforeTimestamp);
router.post('/', ensureLoggedIn, templateController.create);
router.put('/:uuid', ensureLoggedIn, validateUuid, templateController.update);
router.post('/:uuid/persist', ensureLoggedIn, validateUuid, templateController.persist);
router.delete('/:uuid/draft', ensureLoggedIn, validateUuid, templateController.deleteDraft);
router.post('/:uuid/duplicate', ensureLoggedIn, validateUuid, templateController.duplicate);

module.exports = router;
