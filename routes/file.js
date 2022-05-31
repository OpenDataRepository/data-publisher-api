const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require('path');
const controller = require('../controllers/fileController');
// I wish that I could import the destination from FileModel, but no luck since this runs instantly
const upload = multer({dest: path.resolve(process.env.uploads_folder)});
const { ensureLoggedIn } = require('../lib/middleware');

router.post('/:uuid/direct', ensureLoggedIn, controller.verifyFileUpload, upload.single('file'), controller.uploadFileDirect);
router.post('/:uuid/fromUrl', ensureLoggedIn, controller.verifyFileUpload, controller.uploadFileFromUrl);
router.get('/:uuid', controller.getFile);

module.exports = router;
