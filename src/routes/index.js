const express = require('express');
const router = express.Router();

var templateRouter = require('./template');
var templateFieldRouter = require('./template_field');
var datasetRouter = require('./dataset');
var recordRouter = require('./record');
var PermissionRouter = require('./permission');
var importRouter = require('./importer');
var fileRouter = require('./file');
var userRouter = require('./user');
var accountRouter = require('./account');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('not implemented');
});

router.use('/account', accountRouter);
router.use('/user', userRouter);
router.use('/template', templateRouter);
router.use('/template_field', templateFieldRouter);
router.use('/dataset', datasetRouter);
router.use('/record', recordRouter);
router.use('/permission', PermissionRouter);
router.use('/import', importRouter);
router.use('/file', fileRouter);

module.exports = router;
