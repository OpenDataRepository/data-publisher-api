const express = require('express');
const router = express.Router();
// const { param } = require('express-validator');

const { validateUuid, validateTimestamp, ensureLoggedIn } = require('../lib/middleware');
const {templateFieldController} = require('../controllers/templateFieldController');

router.get('/:uuid/draft', ensureLoggedIn, validateUuid, templateFieldController.draft);
router.get('/:uuid/draft_existing', validateUuid, templateFieldController.draftExisting);
router.get('/:uuid/latest_persisted', validateUuid, templateFieldController.latestPersisted);
if(process.env.is_test) {
  router.get('/:uuid/last_update', ensureLoggedIn, validateUuid, templateFieldController.lastUpdate);
}
router.get(
  '/:uuid/:timestamp', 
  validateUuid, 
  validateTimestamp,
  // param('timestamp').isDate(),
  // handleErrors,
  templateFieldController.persistedBeforeTimestamp
);
router.post('/', ensureLoggedIn, templateFieldController.create);
router.put('/:uuid', ensureLoggedIn, validateUuid, templateFieldController.update);
router.post('/:uuid/persist', ensureLoggedIn, validateUuid, templateFieldController.persist);
router.delete('/:uuid/draft', ensureLoggedIn, validateUuid, templateFieldController.deleteDraft);
router.get('/all_public_fields', templateFieldController.allPublicFields);

module.exports = router;
