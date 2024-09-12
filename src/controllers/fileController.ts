import * as fs from 'fs';
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getS3Client, shouldUseS3 } from '../lib/s3';
import { InputError } from '../lib/util';
const fsPromises = fs.promises;
const path = require('path');
const http = require('http');
const axios = require('axios');
const Util = require('../lib/util');
const FileModel = require('../models/file');
const RecordModel = require('../models/record');
const PermissionModel = require(`../models/permission`);

// No need to store this in long term memory. It only exists while the file is being uploaded
const uploads = {};

exports.verifyFileUpload = async function(req, res, next) {
  let uuid = req.params.uuid;
  let state = Util.initializeState(req);
  const file_model = new FileModel.model(state);
  try {
    if(!(await file_model.exists(uuid))) {
      throw new Util.NotFoundError(`Cannot upload file to uuid ${uuid}. Does not exist`);
    }
    let file_metadata = await file_model.get(uuid);
    if(!(await (new RecordModel.model(state)).hasPermissionToDraft(file_metadata.record_uuid, PermissionModel.PermissionTypes.edit))) {
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
  let file_metadata = (new FileModel.model()).get(uuid);
  let record_uuid = file_metadata.record_uuid;
  let field_uuid = file_metadata.field_uuid;

  await RecordModel.updateFileName(record_uuid, field_uuid, uuid, file_name);
}

// TODO: support uploading direct files to S3
// I think the steps would be:
// 1. complete uploading the current way
// 2. add the file to a queue, which then moves files to S3 instead
// 3. if the file is sufficiently large, use multipart upload
exports.uploadFileDirect = async function(req, res, next) {
  try {
    let uuid = req.params.uuid;
    const file_path = path.join(FileModel.localFileStorageLocation(), uuid);

    let startByte = parseInt(req.headers['x-start-byte'], 10);
    if(isNaN(startByte)) {
      throw new InputError('x-start-byte provided in the header must be a valid integer');
    }
    let fileSize = parseInt(req.headers['size'], 10);
    if(isNaN(fileSize)) {
      throw new InputError('fileSize provided in the header must be a valid integer');
    }
    if (uploads[uuid] && fileSize == uploads[uuid].bytesReceived) {
      res.end();
      return;
    }

    if (!uploads[uuid])
      uploads[uuid] = {};

    let upload = uploads[uuid]; // Bytes of file already present

    let fileStream;

    if(startByte) {
      if (upload.bytesReceived != startByte) { //if same file is sent with different size it will not upload
        res.status(400).send(`Wrong start byte. Expected ${upload.bytesReceived}`);
        return;
      }
    } else {
      upload.bytesReceived = 0;
    }

    const operation = startByte ? 'a' : 'w';
    fileStream = fs.createWriteStream(file_path, {
      flags: operation
    });

    req.on('data', function (data) {
      upload.bytesReceived += data.length; // adding length of data we are adding
    });

    req.pipe(fileStream);

    // when the request is finished, and all its data is written
    fileStream.on('close', async function () {
      if (upload.bytesReceived == fileSize) {
        delete uploads[uuid];
        await (new FileModel.model()).markUploaded(uuid);
        res.send({ 'status': 'uploaded' });
      } else {
        res.send({ "uploaded": upload.bytesReceived });
      }
    });

    // in case of I/O error - finish the request
    fileStream.on('error', function (err) {
      console.log("fileStream error", err);
      res.writeHead(500, "File error");
      res.end();
    });

  } catch(err) {
    next(err);
  }
}

exports.directUploadStatus = async function(req, res, next) {
  try {
    let uuid = req.params.uuid;
    let fileSize = parseInt(req.headers['size'], 10);
    if(isNaN(fileSize)) {
      throw new InputError('fileSize provided in the header must be a valid integer');
    }
    if(!(await (new FileModel.model()).exists(uuid))) {
      res.status(404).send(`File ${uuid} does not exist`);
      return;
    }
    try {
      const file_path = path.join(FileModel.localFileStorageLocation(), uuid);
      let stats = fs.statSync(file_path);
  
      if (stats.isFile()) {
        if (fileSize == stats.size) {
          res.send({ 'status': 'file is present' })
          return;
        }
        if (!uploads[uuid])
          uploads[uuid] = {}
        uploads[uuid]['bytesReceived'] = stats.size;
      }
    } catch (er) {
  
    }
  
    let upload = uploads[uuid];
    if (upload)
      res.send({ "uploaded": upload.bytesReceived });
    else
      res.send({ "uploaded": 0 });
  
  } catch (err) {
    next(err);
  }
};


// maybe at some point it would be a good idea to downoad to a different file first,
// and then move that file to the correct location. That way we don't write half of a bad file and then delete it
// Reference: https://stackoverflow.com/questions/11944932/how-to-download-a-file-with-node-js-without-using-third-party-libraries

exports.uploadFileFromUrl = async function(req, res, next) {
  try {
    const uuid = req.params.uuid;
    const download_url = req.body.url;
    if(!download_url) {
      throw new Util.InputError(`Download url not provided`);
    }
    // Solution from here: https://stackoverflow.com/questions/55374755/node-js-axios-download-file-stream-and-writefile
    let download_response
    try {
       download_response = await axios({
        method: "get",
        url: download_url,
        responseType: "stream"
      })
    } catch (err: any) {
      throw new Util.InputError(`Fetching the file from the given url failed with the given message:
        URL: ${download_url}
        Message: ${err.message}`);
    } 

    if(download_response.status != 200) {
      throw new Util.InputError(`Download from url failed: ${download_response.err}`);
    }
    const download_stream = download_response.data;
    const file_model = new FileModel.model();

    if(shouldUseS3()) {
      const upload = new Upload({
        client: getS3Client(),
        // TODO: add logic to use either the public or private bucket
        params: {Bucket: process.env.s3_public_bucket, Key: uuid, Body: download_stream}
      })
      await upload.done();
    } else {
      const file_destination = path.join(FileModel.localFileStorageLocation(), uuid);
      const write_stream = fs.createWriteStream(file_destination);
      try {
        await new Promise((resolve, reject) => {
          download_stream.pipe(write_stream);
          let error: any = null;
          write_stream.on('error', err => {
            error = err;
            write_stream.close();
            reject(err);
          });
          write_stream.on('close', () => {
            if (!error) {
              resolve(true);
            }
            //no need to call the reject here, as it will have been called in the 'error' stream;
          });
        });
      } catch (err: any) {
        await fsPromises.unlink(file_destination);
        throw err;
      }
    }

    await file_model.markUploaded(uuid);
    res.sendStatus(200);    

  } catch(err) {
    next(err);
  }
}

exports.getFile = async function(req, res, next) {
  try {
    const uuid = req.params.uuid;
    let state = Util.initializeState(req);
    const file_model = await (new FileModel.model(state))
    if(!(await file_model.exists(uuid))) {
      throw new Util.NotFoundError(`File with uuid ${uuid} does not exist`);
    }
    let file_metadata = await file_model.get(uuid);
    let record_uuid = file_metadata.record_uuid;
    let record_model = new RecordModel.model(state);

    let permission_error = new Util.PermissionDeniedError(`You do not have the view permissions required to view a file attached to record ${file_metadata.record_uuid}`);
    if(file_metadata.persisted) {
      if(!(await record_model.hasPermission(record_uuid, PermissionModel.PermissionTypes.view))) {
        throw permission_error;
      }
    } else {
      if(!(await record_model.hasPermissionToDraft(record_uuid, PermissionModel.PermissionTypes.edit))) {
        throw permission_error;
      }
    }
    if(!file_metadata.uploaded) {
      throw new Util.NotFoundError(`Uuid ${uuid} exists but no file for it has been uploaded.`);
    }
    let stream;
    if(file_metadata.location == "local") {
      const file_path = path.join(FileModel.localFileStorageLocation(), req.params.uuid);
      stream = fs.createReadStream(file_path);
    } else {
      const getCommand = new GetObjectCommand({
        Bucket: file_metadata.location,
        Key: uuid,
      });
      const response = await getS3Client().send(getCommand);
      stream = response.Body;
    }
    stream.pipe(res);
  } catch(err) {
    next(err);
  }
}

// With AWS: https://www.youtube.com/watch?v=NZElg91l_ms