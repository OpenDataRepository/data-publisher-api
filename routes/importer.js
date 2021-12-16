const express = require('express');
const router = express.Router();

const controller = require('../controllers/importController');

router.post('/:template', controller.template);

module.exports = router;
