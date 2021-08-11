const express = require('express');
const router = express.Router();

const templateFieldController = require('../controllers/templateFieldController');

router.get('/:uuid/draft', templateFieldController.draft_get);
// router.get('/:uuid/draft_existing', templateFieldController.draft_existing);
router.get('/:uuid/latest_published', templateFieldController.get_latest_published);
router.get('/:uuid/last_update', templateFieldController.get_last_update);
router.get('/:uuid/:timestamp', templateFieldController.get_published_before_timestamp);
router.post('/', templateFieldController.create);
router.put('/:uuid', templateFieldController.update);
router.post('/:uuid/publish', templateFieldController.publish);
router.delete('/:uuid/draft', templateFieldController.draft_delete);

module.exports = router;
