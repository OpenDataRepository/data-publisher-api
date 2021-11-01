const express = require('express');
const router = express.Router();

var templateRouter = require('./template');
var templateFieldRouter = require('./template_field');
var datasetRouter = require('./dataset');
var recordRouter = require('./record');
var permissionGroupRouter = require('./permission_group');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('not implemented');
});

router.use('/template', templateRouter);
router.use('/template_field', templateFieldRouter);
router.use('/dataset', datasetRouter);
router.use('/record', recordRouter);
router.use('/permission_group', permissionGroupRouter);

module.exports = router;
