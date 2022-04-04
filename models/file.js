const fs = require('fs');
const path = require('path');
const { v4: uuidv4} = require('uuid');

const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');
const SharedFunctions = require('./shared_functions');

var File;

const Upload_Destination = path.resolve("uploads/");
exports.Upload_Destination = Upload_Destination;

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

exports.init = async function() {
  File = await collection();
}

// Clear out the old file attached to this uuid so we can attach a new one
const repurposeExistingDraft = async function(record_uuid, template_field_uuid, session) {
  let draft = await File.findOne(
    {record_uuid, template_field_uuid, persisted: false},
    {session}
  );
  if(!draft) {
    return null;
  }
  let uuid = draft.uuid;

  // Delete existing file in file system
  let file_path = path.join(Upload_Destination, uuid);
  await fs.unlink(file_path);

  // Mark unuploaded
  let response = await File.updateOne(
    {uuid}, 
    {$set: {uploaded: false}},
    {session}
  );
  if (response.modifiedCount != 1) {
    throw new Error(`File.markUploaded: Modified: ${response.modifiedCount}.`);
  } 

  return uuid;
}

const newFile = async function(record_uuid, template_field_uuid, session) {
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

// creates a newFile if a draft doesn't already exist for this record+field.
// If a record does exist, it will change uploaded to false, delete the file, and return that uuid
exports.getExistingDraftUuidOrCreateNew = async function(record_uuid, template_field_uuid, session) {
  let file_uuid = await repurposeExistingDraft(record_uuid, template_field_uuid, session);
  if(file_uuid) {
    return file_uuid;
  }
  file_uuid = await newFile(record_uuid, template_field_uuid, session);
  return file_uuid;
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

exports.delete = async function(uuid) {
  let response = await File.delete(
    {uuid}
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