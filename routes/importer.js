const express = require('express');
const router = express.Router();

const controller = require('../controllers/importController');

router.post('/template', controller.template);
router.post('/datasets_and_records', controller.datasets_and_records);
router.post('/template_with_dataset', controller.template_with_dataset);
router.post('/records', controller.records);

module.exports = router;
