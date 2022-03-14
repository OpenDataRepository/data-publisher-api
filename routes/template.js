const express = require('express');
const router = express.Router();

const {validateUuid, validateTimestamp} = require('../lib/middleware');
const templateController = require('../controllers/templateController');

router.get('/:uuid/draft', validateUuid, templateController.draft_get);
router.get('/:uuid/draft_existing', validateUuid, templateController.draft_existing);
router.get('/:uuid/latest_persisted', validateUuid, templateController.get_latest_persisted);
router.get('/:uuid/last_update', validateUuid, templateController.get_last_update);
router.get('/:uuid/:timestamp', validateUuid, validateTimestamp, templateController.get_persisted_before_timestamp);
router.post('/', templateController.create);
router.put('/:uuid', validateUuid, templateController.update);
router.post('/:uuid/persist', validateUuid, templateController.persist);
router.delete('/:uuid/draft', validateUuid, templateController.draft_delete);
router.post('/:uuid/duplicate', validateUuid, templateController.duplicate);

module.exports = router;
