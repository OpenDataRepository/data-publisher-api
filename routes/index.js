const express = require('express');
const router = express.Router();

var templateRouter = require('./template');
var templateFieldRouter = require('./template_field');
var recordRouter = require('./record');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('not implemented');
});

router.use('/template', templateRouter);
router.use('/template_field', templateFieldRouter);

router.use('/record', recordRouter);

module.exports = router;
