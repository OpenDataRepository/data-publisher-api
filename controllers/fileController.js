const fs = require('fs');
const path = require('path');
const http = require('http');
const Util = require('../lib/util');
const SharedFunctions = require('../models/shared_functions');
const FileModel = require('../models/file');
const RecordModel = require('../models/record');
const PermissionGroupModel = require(`../models/permission_group`);

// TODO: add file name. If something is a file, we should accept a file_name property. In record create/update

exports.verifyFileUpload = async function(req, res, next) {
  let uuid = req.params.uuid;
  let user = req.cookies.user;
  try {
    if(!(await SharedFunctions.exists(FileModel.collection(), uuid))) {
      throw new Util.NotFoundError(`Cannot upload file to uuid ${uuid}. Does not exist`);
    }
    let file_metadata = await SharedFunctions.latestDocument(FileModel.collection(), uuid);
    if(!(await RecordModel.userHasPermissionsTo(file_metadata.record_uuid, PermissionGroupModel.PERMISSION_EDIT, user))) {
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
    fs.renameSync(req.file.path, path.join(FileModel.Upload_Destination, uuid));
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

    let file_destination = path.join(FileModel.Upload_Destination, uuid);
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
  let uuid = req.params.uuid;
  let user = req.cookies.user;
  try {
    if(!(await SharedFunctions.exists(FileModel.collection(), uuid))) {
      throw new Util.NotFoundError(`Cannot upload file to uuid ${uuid}. Does not exist`);
    }
    let file_metadata = await SharedFunctions.latestDocument(FileModel.collection(), uuid);
    let record_uuid = file_metadata.record_uuid;
    if(await RecordModel.userHasPermissionsTo(record_uuid, PermissionGroupModel.PERMISSION_VIEW, user)) {
    } else if (file_metadata.published && await SharedFunctions.userHasAccessToPersistedResource(RecordModel.collection(), record_uuid, user, PermissionGroupModel.PERMISSION_VIEW)) {
    } else {
      throw new Util.PermissionDeniedError(`You do not have the view permissions required to add a file to record ${file_metadata.record_uuid}`);
    }
  } catch(err) {
    next(err);
  }

  const file = path.join(FileModel.Upload_Destination, req.params.uuid);
  res.sendFile(file);
}

// With AWS: https://www.youtube.com/watch?v=NZElg91l_ms