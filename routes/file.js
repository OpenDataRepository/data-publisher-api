const express = require('express');
const router = express.Router();
const multer = require("multer");
const controller = require('../controllers/fileController');
const upload = multer({dest: controller.Upload_Destination});

router.post('/:uuid', upload.single('file'), controller.uploadFile);
router.get('/:uuid', controller.getFile);

module.exports = router;
