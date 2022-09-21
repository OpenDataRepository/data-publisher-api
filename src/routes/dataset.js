const express = require('express');
const router = express.Router();

const { validateUuid, validateTimestamp, ensureLoggedIn } = require('../lib/middleware');
const controller = require('../controllers/datasetController');

router.get('/new_dataset_for_template/:uuid', ensureLoggedIn, validateUuid, controller.new_dataset_for_template);
router.get('/:uuid/draft', ensureLoggedIn, validateUuid, controller.draft_get);
router.get('/:uuid/draft_existing', validateUuid, controller.draft_existing);
router.get('/:uuid/latest_persisted', validateUuid, controller.get_latest_persisted);
router.get('/:uuid/last_update', ensureLoggedIn, validateUuid, controller.get_last_update);
router.post('/', ensureLoggedIn, controller.create);
router.put('/:uuid', ensureLoggedIn, validateUuid, controller.update);
router.post('/:uuid/persist', ensureLoggedIn, validateUuid, controller.persist);
router.delete('/:uuid/draft', ensureLoggedIn, validateUuid, controller.draft_delete);
router.post('/:uuid/duplicate', ensureLoggedIn, validateUuid, controller.duplicate);
router.post('/:uuid/publish', ensureLoggedIn, validateUuid, controller.publish);
router.get('/:uuid/published/:name', validateUuid, controller.published);
router.get('/:uuid/published/:name/records', validateUuid, controller.published_records);
router.get('/:uuid/:timestamp', validateUuid, validateTimestamp, controller.get_persisted_before_timestamp);
router.get('/all_public_uuids', controller.all_public_uuids);
router.get('/all_viewable_uuids', controller.all_viewable_uuids);
// TODO: add an endpoint to set a dataset and all of it's sub-datasets to a given public date

module.exports = router;
