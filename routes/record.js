const express = require('express');
const router = express.Router();

const {validateUuid} = require('../lib/middleware');
const controller = require('../controllers/recordController');

router.get('/:uuid/draft', validateUuid, controller.draft_get);
router.get('/:uuid/draft_existing', validateUuid, controller.draft_existing);
router.get('/:uuid/latest_published', validateUuid, controller.get_latest_published);
router.get('/:uuid/last_update', validateUuid, controller.get_last_update);
router.get('/:uuid/:timestamp', validateUuid, controller.get_published_before_timestamp);
router.post('/', controller.create);
router.put('/:uuid', validateUuid, controller.update);
router.post('/:uuid/publish', validateUuid, controller.publish);
router.delete('/:uuid/draft', validateUuid, controller.draft_delete);

module.exports = router;
