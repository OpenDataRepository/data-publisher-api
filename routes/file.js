const express = require('express');
const router = express.Router();
const multer = require("multer");
const controller = require('../controllers/fileController');
const upload = multer({dest: controller.Upload_Destination});

router.post('/:uuid/direct', controller.verifyFileUpload, upload.single('file'), controller.uploadFileDirect);
router.post('/:uuid/fromUrl', controller.verifyFileUpload, controller.uploadFileFromUrl);
router.get('/:uuid', controller.getFile);

module.exports = router;
