const express = require('express');
const router = express.Router();

const {validateUuid, validateTimestamp} = require('../lib/middleware');
const controller = require('../controllers/datasetController');

router.get('/new_dataset_for_template/:uuid', validateUuid, controller.new_dataset_for_template);
router.get('/:uuid/draft', validateUuid, controller.draft_get);
router.get('/:uuid/draft_existing', validateUuid, controller.draft_existing);
router.get('/:uuid/latest_persisted', validateUuid, controller.get_latest_persisted);
router.get('/:uuid/last_update', validateUuid, controller.get_last_update);
router.post('/', controller.create);
router.put('/:uuid', validateUuid, controller.update);
router.post('/:uuid/persist', validateUuid, controller.persist);
router.delete('/:uuid/draft', validateUuid, controller.draft_delete);
router.post('/:uuid/duplicate', validateUuid, controller.duplicate);
router.post('/:uuid/publish', validateUuid, controller.publish);
router.get('/:uuid/published/:name', validateUuid, controller.published);
// TODO: at some point write a similar endpoint which will fetch the records for the published dataset
router.get('/:uuid/:timestamp', validateUuid, validateTimestamp, controller.get_persisted_before_timestamp);

module.exports = router;
