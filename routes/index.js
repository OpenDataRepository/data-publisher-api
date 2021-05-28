const express = require('express');
const router = express.Router();
const indexController = require('../controllers/indexController');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('not implemented');
});

router.get('/search/template/:id', indexController.template_get);

module.exports = router;
