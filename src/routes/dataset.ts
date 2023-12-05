const express = require('express');
const router = express.Router();

const { validateUuid, validateTimestamp, ensureLoggedIn } = require('../lib/middleware');
const {datasetController} = require('../controllers/datasetController');

router.get('/new_dataset_for_template/:uuid', ensureLoggedIn, validateUuid, datasetController.newDatasetForTemplate);
router.get('/:uuid/draft', ensureLoggedIn, validateUuid, datasetController.draft);
router.get('/:uuid/draft_existing', validateUuid, datasetController.draftExisting);
router.get('/:uuid/latest_persisted', validateUuid, datasetController.latestPersisted);
router.get('/persisted_version/:id', datasetController.persistedVersion);
router.get('/:uuid/last_update', ensureLoggedIn, validateUuid, datasetController.lastUpdate);
router.post('/', ensureLoggedIn, datasetController.create);
router.put('/:uuid', ensureLoggedIn, validateUuid, datasetController.update);
router.post('/:uuid/persist', ensureLoggedIn, validateUuid, datasetController.persist);
router.get('/:uuid/records', datasetController.records)
router.delete('/:uuid/draft', ensureLoggedIn, validateUuid, datasetController.deleteDraft);
router.post('/:uuid/duplicate', ensureLoggedIn, validateUuid, datasetController.duplicate);
router.post('/:uuid/publish', ensureLoggedIn, validateUuid, datasetController.publish);
router.get('/:uuid/published/:name', validateUuid, datasetController.published);
router.get('/:uuid/published/:name/records', validateUuid, datasetController.publishedRecords);
router.get('/:uuid/published/:name/search_records', validateUuid, datasetController.searchPublishedRecords);
router.get('/:uuid/:timestamp', validateUuid, validateTimestamp, datasetController.persistedBeforeTimestamp);
router.get('/all_public_uuids', datasetController.allPublicUuids);
router.get('/all_viewable_uuids', datasetController.allViewableUuids);
router.get('/all_public_datasets', datasetController.allPublicDatasets);
// TODO: add an endpoint to set a dataset and all of it's sub-datasets to a given public date

export = router;
