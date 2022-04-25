const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { v4: uuidv4} = require('uuid');

const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');
const SharedFunctions = require('./shared_functions');

var File;

var Upload_Destination;

// Returns a reference to the permission_groups Mongo Collection
async function collection() {
  if (File === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('files');
    } catch(e) {}
    File = db.collection('files');
  }
  return File;
}
exports.collection = function() {
  return File;
}
exports.uploadDestination = function() {
  return Upload_Destination;
}

exports.init = async function() {
  File = await collection();
  Upload_Destination = path.resolve(process.env.uploads_folder);
}


exports.newFile = async function(record_uuid, template_field_uuid, session) {
  let uuid = uuidv4();
  let fileObject = {
    uuid,
    record_uuid,
    template_field_uuid,
    uploaded: false,
    persisted: false
  }

  let response = await File.insertOne(
    fileObject,
    { session }
  );
  if (response.insertedCount != 1) {
    throw new Error(`File.newFile: Failed to insert uuid ${uuid}`);
  } 

  return uuid;
}

exports.markUploaded = async function(uuid, session) {
  let response = await File.updateOne(
    {uuid}, 
    {$set: {uploaded: true}},
    {session}
  );
  if (response.modifiedCount > 1) {
    throw new Error(`File.markUploaded: Modified: ${response.modifiedCount}.`);
  } 
}

exports.markPersisted = async function(uuid, session) {

  let document = await File.findOne(
    {uuid},
    {session}
  );
  if(!document) {
    throw new Util.InputError(`Cannot persist file ${uuid}. Does not exist`);
  }

  if(!document.uploaded) {
    throw new Util.InputError(`Cannot persist file ${uuid}. It has not yet been uploaded`);
  }

  let response = await File.updateOne(
    {uuid}, 
    {$set: {persisted: true}},
    {session}
  );
  if (response.modifiedCount > 1) {
    throw new Error(`File.markPersisted: Modified: ${response.modifiedCount}.`);
  } 
}

// At the moment, the user is not allowed to delete the file directly.
// Only a record can request a delete if it loses the reference to a file
exports.delete = async function(uuid, session) {
  if(!(await SharedFunctions.exists(File, uuid))) {
    throw new Util.NotFoundError(`Cannot delete file ${uuid}. Does not exist`);
  }
  let file_metadata = await SharedFunctions.latestDocument(File, uuid);
  if(file_metadata.persisted) {
    throw new Util.InputError(`Cannot delete file as the record it has been attached to has already been persisted.`);
  }
  
  if(file_metadata.uploaded) {
    let file_path = path.join(Upload_Destination, uuid);
    await fsPromises.unlink(file_path);
  }
  let response = await File.deleteMany(
    {uuid},
    {session}
  );
  if(response.deletedCount != 1) {
    throw new Error(`File.delete: Deleted: ${resonse.deletedCount}`);
  }
}

exports.existsWithParams = async function(uuid, record_uuid, template_field_uuid, session) {
  let draft = await File.findOne(
    {uuid, record_uuid, template_field_uuid},
    {session}
  );
  if(draft) {
    return true;
  }
  return false;
}