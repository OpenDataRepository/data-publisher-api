const fs = require('fs');
const path = require('path');
const http = require('http');
const Util = require('../lib/util');


const Upload_Destination = path.resolve("uploads/");
exports.Upload_Destination = Upload_Destination;

exports.uploadFileDirect = async function(req, res, next) {
  try {
    fs.renameSync(req.file.path, path.join(Upload_Destination, req.params.uuid));
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
      res.sendStatus(200);
    });
  } catch(err) {
    next(err);
  }
}

exports.getFile = async function(req, res, next) {
  const file = path.join(Upload_Destination, req.params.uuid);
  res.sendFile(file);
}

// With AWS: https://www.youtube.com/watch?v=NZElg91l_ms