const express = require('express');
const router = express.Router();
// const { param } = require('express-validator');

const { validateUuid, validateTimestamp } = require('../lib/middleware');
const templateFieldController = require('../controllers/templateFieldController');

router.get('/:uuid/draft', validateUuid, templateFieldController.draft_get);

router.get('/:uuid/draft_existing', validateUuid, templateFieldController.draft_existing);

router.get('/:uuid/latest_persisted', validateUuid, templateFieldController.get_latest_persisted);

router.get('/:uuid/last_update', validateUuid, templateFieldController.get_last_update);

router.get(
  '/:uuid/:timestamp', 
  validateUuid, 
  validateTimestamp,
  // param('timestamp').isDate(),
  // handleErrors,
  templateFieldController.get_persisted_before_timestamp
);

router.post('/', templateFieldController.create);

router.put('/:uuid', validateUuid, templateFieldController.update);

router.post('/:uuid/persist', validateUuid, templateFieldController.persist);

router.delete('/:uuid/draft', validateUuid, templateFieldController.draft_delete);

module.exports = router;
