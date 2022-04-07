const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require('path');
const controller = require('../controllers/fileController');
// I wish that I could import the destionaltion from FileModel, but no luck since this runs instantly
const upload = multer({dest: path.resolve(process.env.uploads_folder)});

router.post('/:uuid/direct', controller.verifyFileUpload, upload.single('file'), controller.uploadFileDirect);
router.post('/:uuid/fromUrl', controller.verifyFileUpload, controller.uploadFileFromUrl);
router.get('/:uuid', controller.getFile);

module.exports = router;
