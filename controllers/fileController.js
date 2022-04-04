const fs = require('fs');
const path = require('path');
const http = require('http');
const Util = require('../lib/util');
const SharedFunctions = require('../models/shared_functions');
const FileModel = require('../models/file');
const RecordModel = require('../models/record');
const PermissionGroupModel = require(`../models/permission_group`);

// TODO: move all of the logic in the controller to the model, after I have everything working
const Upload_Destination = path.resolve("uploads/");
exports.Upload_Destination = Upload_Destination;

// TODO: When a record is updated, if a file uuid reference is lost and isn't persisted, delete it. 
// Do this by comparing to the previous draft

exports.verifyFileUpload = async function(req, res, next) {
  let uuid = req.params.uuid;
  let user = req.cookies.user;
  try {
    if(!(await SharedFunctions.exists(FileModel.collection(), uuid))) {
      throw new Util.NotFoundError(`Cannot upload file to uuid ${uuid}. Does not exist`);
    }
    let file_metadata = await SharedFunctions.latestDocument(FileModel.collection(), uuid);
    if(!RecordModel.userHasPermissionsTo(file_metadata.record_uuid, PermissionGroupModel.PERMISSION_EDIT, user)) {
      throw new Util.PermissionDeniedError(`You do not have the edit permissions required to add a file to record ${file_metadata.record_uuid}`);
    }
    if(file_metadata.persisted) {
      throw new Util.InputError(`The named file has already been persisted and cannot be overwritten`);
    }
  } catch (err) {
    next(err);
  }
  next();
}

exports.uploadFileDirect = async function(req, res, next) {
  let uuid = req.params.uuid;
  
  const callback = async (session) => {
    await FileModel.markUploaded(uuid, session);
    fs.renameSync(req.file.path, path.join(Upload_Destination, uuid));
  }
  try {
    await SharedFunctions.executeWithTransaction(callback);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.uploadFileFromUrl = async function(req, res, next) {
  try {
    let uuid = req.params.uuid;
    let downloadUrl = req.body.url;
    if(!downloadUrl) {
      throw new Util.InputError(`Download url not provided`);
    }

    let file_destination = path.join(Upload_Destination, uuid);
    var file = fs.createWriteStream(file_destination);
    http.get(downloadUrl, function(response) {
      if(response.statusCode != 200) {
        throw new Util.InputError(`Request failed. Status Code: ${response.statusCode}`)
      }
      response.pipe(file);
      // it would probably be better to do this in a transaction, but http.get and response.pipe are a bit challenging
      FileModel.markUploaded(uuid)
      .then(() => {
        res.sendStatus(200);
      });
    });
  } catch(err) {
    next(err);
  }
}

exports.getFile = async function(req, res, next) {
  const file = path.join(Upload_Destination, req.params.uuid);
  res.sendFile(file);
}

// TODO: Delete this. I think only a record should be able to delete a file. The user can upload a new one, but they can't delete the old one
exports.deleteFile = async function(req, res, next) {
  let uuid = req.params.uuid;
  try {
    if(!(await SharedFunctions.exists(FileModel.collection(), uuid))) {
      throw new Util.NotFoundError(`Cannot delete file ${uuid}. Does not exist`);
    }
    let file_metadata = await SharedFunctions.latestDocument(FileModel.collection(), uuid);
    if(!RecordModel.userHasPermissionsTo(file_metadata.record_uuid, PermissionGroupModel.PERMISSION_EDIT, user)) {
      throw new Util.PermissionDeniedError(`You do not have the edit permissions required to delete a file in record ${file_metadata.record_uuid}`);
    }
    if(file_metadata.persisted) {
      throw new Util.InputError(`Cannot delete file as the record it has been attached to has already been persisted.`);
    }
    
    let file_path = path.join(Upload_Destination, uuid);
    await fs.unlink(file_path);
    await FileModel.delete(uuid);
  } catch(err) {
    next(err);
  }

  const file = path.join(Upload_Destination, req.params.uuid);
  res.sendFile(file);
}

// With AWS: https://www.youtube.com/watch?v=NZElg91l_ms