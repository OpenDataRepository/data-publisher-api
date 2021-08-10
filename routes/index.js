const express = require('express');
const router = express.Router();
const indexController = require('../controllers/indexController');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('not implemented');
});

router.get('/template/:uuid/draft', indexController.template_draft_get);
router.get('/template/:uuid/draft_existing', indexController.template_draft_existing);
router.get('/template/:uuid/latest_published', indexController.template_get_latest_published);
router.get('/template/:uuid/last_update', indexController.template_get_last_update);
router.get('/template/:uuid/:timestamp', indexController.template_get_published_before_timestamp);
router.post('/template', indexController.template_create);
router.put('/template/:uuid', indexController.template_update);
router.post('/template/:uuid/publish', indexController.template_publish);
router.delete('/template/:uuid/draft', indexController.template_draft_delete);

module.exports = router;
