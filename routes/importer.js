const express = require('express');
const router = express.Router();

const controller = require('../controllers/importController');

router.post('/template', controller.template);
router.post('/datasets_and_records', controller.datasets_and_records);

module.exports = router;
