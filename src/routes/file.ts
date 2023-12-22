const express = require('express');
const router = express.Router();
const controller = require('../controllers/fileController');
const { ensureLoggedIn } = require('../lib/middleware');

router.post('/:uuid/direct', ensureLoggedIn, controller.verifyFileUpload, controller.uploadFileDirect);
router.get('/:uuid/directUploadStatus', ensureLoggedIn, controller.directUploadStatus);
router.post('/:uuid/fromUrl', ensureLoggedIn, controller.verifyFileUpload, controller.uploadFileFromUrl);
router.get('/:uuid', controller.getFile);

export = router;
