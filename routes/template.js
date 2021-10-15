const express = require('express');
const router = express.Router();

const templateController = require('../controllers/templateController');

router.get('/:uuid/draft', templateController.draft_get);
router.get('/:uuid/draft_existing', templateController.draft_existing);
router.get('/:uuid/latest_published', templateController.get_latest_published);
router.get('/:uuid/last_update', templateController.get_last_update);
router.get('/:uuid/:timestamp', templateController.get_published_before_timestamp);
router.post('/', templateController.create);
router.put('/:uuid', templateController.update);
router.post('/:uuid/publish', templateController.publish);
router.delete('/:uuid/draft', templateController.draft_delete);
router.post('/:uuid/duplicate', templateController.duplicate);

module.exports = router;
