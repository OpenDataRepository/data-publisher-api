const express = require('express');
const router = express.Router();
const indexController = require('../controllers/indexController');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('not implemented');
});

router.get('/template/:id', indexController.template_get);
router.post('/template', indexController.template_create);

module.exports = router;
