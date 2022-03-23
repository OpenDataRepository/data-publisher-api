const fs = require('fs');
const path = require('path');

const Upload_Destination = path.resolve("uploads/");
exports.Upload_Destination = Upload_Destination;

exports.uploadFile = async function(req, res, next) {
  try {
    fs.renameSync(req.file.path, path.join(Upload_Destination, req.params.uuid));
    res.sendStatus(200);
  } catch(err) {
    next(err);
  }
}

exports.getFile = async function(req, res, next) {
  const file = path.join(Upload_Destination, req.params.uuid);
  res.sendFile(file);
}

// With AWS: https://www.youtube.com/watch?v=NZElg91l_ms