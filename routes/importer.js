const express = require('express');
const router = express.Router();

const { ensureLoggedIn } = require('../lib/middleware');
const controller = require('../controllers/importController');

router.post('/template', ensureLoggedIn(), controller.template);
router.post('/datasets_and_records', ensureLoggedIn(), controller.datasets_and_records);
router.post('/template_with_dataset', ensureLoggedIn(), controller.template_with_dataset);
router.post('/records', ensureLoggedIn(), controller.records);

module.exports = router;
