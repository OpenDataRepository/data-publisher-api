const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const http = require('http');
const axios = require('axios');
const Util = require('../lib/util');
const SharedFunctions = require('../models/shared_functions');
const FileModel = require('../models/file');
const RecordModel = require('../models/record');
const PermissionGroupModel = require(`../models/permission_group`);


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
    if(file_metadata.uploaded) {
      throw new Util.InputError(`A file has already been uploaded for the given uuid and cannot be replaced.`);
    }
    if(file_metadata.persisted) {
      throw new Util.InputError(`The provided file has already been persisted and cannot be overwritten`);
    }
  } catch (err) {
    next(err);
  }
  next();
}

// Maybe I can just ignore this for now
async function updateFileName(uuid, file_name) {
  let file_metadata = await SharedFunctions.latestDocument(FileModel.collection(), uuid);
  let record_uuid = file_metadata.record_uuid;
  let field_uuid = file_metadata.field_uuid;

  await RecordModel.updateFileName(record_uuid, field_uuid, uuid, file_name);
}

exports.uploadFileDirect = async function(req, res, next) {
  let uuid = req.params.uuid;
  
  const callback = async (session) => {
    await FileModel.markUploaded(uuid, session);
    // await updateFileName(uuid, req.file.originalname);
    fs.renameSync(req.file.path, path.join(FileModel.uploadDestination(), uuid));
  }
  try {
    await SharedFunctions.executeWithTransaction(callback);
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

// TODO: maybe at some point it would be a good idea to downoad to a different file first,
// and then move that file to the correct location. That way we don't write half of a bad file and then delete it
// Reference: https://stackoverflow.com/questions/11944932/how-to-download-a-file-with-node-js-without-using-third-party-libraries

exports.uploadFileFromUrl = async function(req, res, next) {
  try {
    let uuid = req.params.uuid;
    let downloadUrl = req.body.url;
    if(!downloadUrl) {
      throw new Util.InputError(`Download url not provided`);
    }

    let httpGetPromisified = async () => {
      return new Promise((resolve, reject) => {
        http.get(downloadUrl, function(response) {
          if(response.statusCode != 200) {
            reject(new Util.InputError(`Download from url failed. Status Code: ${response.statusCode}`));
            return;
          }
          try {
            let file_destination = path.join(FileModel.uploadDestination(), uuid);
            var writeStream = fs.createWriteStream(file_destination);
            response.pipe(writeStream);
      
            writeStream.on("finish", () => {
              writeStream.close();
              FileModel.markUploaded(uuid)
              .then(() => {
                resolve();
              });
            });
          } catch(err) {
            reject(err);
          }
        }).on('error', (err) => {
          reject(err);
        });
      });
    };
    // await httpGetPromisified();
    // res.sendStatus(200);

    let file_destination = path.join(FileModel.uploadDestination(), uuid);
    var writeStream = fs.createWriteStream(file_destination);

    // Solution from here: https://stackoverflow.com/questions/55374755/node-js-axios-download-file-stream-and-writefile
    try {
      await axios({
        method: "get",
        url: downloadUrl,
        responseType: "stream"
      }).then((response) => {
  
        if(response.status != 200) {
          reject(new Util.InputError(`Download from url failed: ${err}`));
        }
        //ensure that the user can call `then()` only when the file has
        //been downloaded entirely.
  
        return new Promise((resolve, reject) => {
          response.data.pipe(writeStream);
          let error = null;
          writeStream.on('error', err => {
            error = err;
            writer.close();
            reject(err);
          });
          writeStream.on('close', () => {
            if (!error) {
              resolve(true);
            }
            //no need to call the reject here, as it will have been called in the
            //'error' stream;
          });
        });
      });
    } catch (err) {
      await fsPromises.unlink(file_destination);
      if(err.isAxiosError) {
        throw new Util.InputError('Fetching the file from the specified url failed with message: ' + err.message);
      } else {
        throw err;
      }
    }
    await FileModel.markUploaded(uuid);
    res.sendStatus(200);    

  } catch(err) {
    next(err);
  }
}

exports.getFile = async function(req, res, next) {
  let uuid = req.params.uuid;
  let user = req.cookies.user;
  try {
    if(!(await SharedFunctions.exists(FileModel.collection(), uuid))) {
      throw new Util.NotFoundError(`File with uuid ${uuid} does not exist`);
    }
    let file_metadata = await SharedFunctions.latestDocument(FileModel.collection(), uuid);
    let record_uuid = file_metadata.record_uuid;
    if(await RecordModel.userHasPermissionsTo(record_uuid, PermissionGroupModel.PERMISSION_VIEW, user)) {
    } else if (file_metadata.published && await SharedFunctions.userHasAccessToPersistedResource(RecordModel.collection(), record_uuid, user, PermissionGroupModel.PERMISSION_VIEW)) {
    } else {
      throw new Util.PermissionDeniedError(`You do not have the view permissions required to view a file attached to record ${file_metadata.record_uuid}`);
    }
    if(!file_metadata.uploaded) {
      throw new Util.NotFoundError(`Uuid ${uuid} exists but no file for it has been updated.`);
    }
  } catch(err) {
    next(err);
  }

  const file = path.join(FileModel.uploadDestination(), req.params.uuid);
  res.sendFile(file);
}

// With AWS: https://www.youtube.com/watch?v=NZElg91l_ms