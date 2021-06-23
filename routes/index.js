const express = require('express');
const router = express.Router();
const indexController = require('../controllers/indexController');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('not implemented');
});

router.get('/template/:id/draft', indexController.template_draft_get);
router.get('/template/:id/latest_published', indexController.template_get_latest_published);
router.post('/template', indexController.template_create);
router.put('/template/:id', indexController.template_update);
router.post('/template/:id/publish', indexController.template_publish);

module.exports = router;
