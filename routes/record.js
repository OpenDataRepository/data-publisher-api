const express = require('express');
const router = express.Router();

const controller = require('../controllers/recordController');

router.get('/:uuid/draft', controller.draft_get);
router.get('/:uuid/latest_published', controller.get_latest_published);
router.get('/:uuid/:timestamp', controller.get_published_before_timestamp);
router.post('/', controller.create);
router.put('/:uuid', controller.update);
router.post('/:uuid/publish', controller.publish);
router.delete('/:uuid/draft', controller.draft_delete);

module.exports = router;
