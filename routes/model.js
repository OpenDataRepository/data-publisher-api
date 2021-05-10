const debug = require('debug')('setup');
var express = require('express');
var router = express.Router();
const passport = require('passport');
require('../config/config.passport');
var TriboLabController = require('../controllers/tribo_lab_controller');

debug('Model Route Loaded.');
router.post('/',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.generateReportData);
router.post('/start',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.startReportProcessing);
router.post('/jobs/note',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.addNote);
router.post('/jobs/tag',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.addTag);
router.get('/jobs/children',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.getJobsAndChildrenForUser);
router.get('/jobs/:job_id',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.getRunsForJob);
router.get('/jobs/:job_id/:run_id',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.getSpecificRunData);
router.get('/jobs',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.getJobsForUser);
router.get('/:id',
  passport.authenticate('jwt', { session: false }),
  TriboLabController.getReportData);

module.exports = router;
