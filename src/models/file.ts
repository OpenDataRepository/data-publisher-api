import * as fs from 'fs';
import { BasicAbstractDocument } from './basic_abstract_document';
const fsPromises = fs.promises;
const path = require('path');
const { v4: uuidv4} = require('uuid');

const MongoDB = require('../lib/mongoDB');
const Util = require('../lib/util');

// TODO: at some point implement files to interpret image files and to create thumbnails as well

// Mongodb schema for file
// Need to keep track of the state of the file and which record it's kept on
const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "uuid", "record_uuid", "template_field_uuid", "uploaded", "persisted" ],
  properties: {
    _id: {
      bsonType: "objectId"
    },
    uuid: {
      bsonType: "string",
      description: "unique identifier for the file. A file can be used accross multiple versions of a record."
      // uuid should be in a valid uuid format as well
    },
    record_uuid: {
      bsonType: "string",
      description: "identifies the record this file belongs to"
    },
    template_field_uuid: {
      bsonType: "string",
      description: "identifies the template_field within the record that this file belongs to"
    },
    uploaded: {
      bsonType: "bool",
      description: "identifies whether or not an actual file has been uploaded for this file_uuid"
    },
    persisted: {
      bsonType: "bool",
      description: "identifies whether or not the record containing this file has been persisted. If so, the file cannot be deleted"
    }
  },
  additionalProperties: false
});

var File;

var Upload_Destination;

// Returns a reference to the permissions Mongo Collection
async function collection() {
  if (File === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('files', {validator: { $jsonSchema: Schema} });
      await db.collection('files').createIndex({ uuid: 1 });
    } catch(e) {
      db.command({collMod:'files', validator: { $jsonSchema: Schema }});
    }
    File = db.collection('files');
  }
  return File;
}
function collectionExport() {
  return File;
}
function uploadDestination() {
  return Upload_Destination;
}

async function init() {
  File = await collection();
  Upload_Destination = path.resolve(process.env.uploads_folder as string);
}

class Model extends BasicAbstractDocument {
  collection = File;
  permission_model: any;

  constructor(public state){
    super(state);
    this.state = state ? state : {};
    this.collection = File;
  }

  async newFile(record_uuid, template_field_uuid) {
    let uuid = uuidv4();
    let fileObject = {
      uuid,
      record_uuid,
      template_field_uuid,
      uploaded: false,
      persisted: false
    }
  
    let response = await this.collection.insertOne(
      fileObject,
      { session: this.state.session }
    );
    if (!response.acknowledged) {
      throw new Error(`File.newFile: Failed to insert uuid ${uuid}`);
    } 
  
    return uuid;
  }

  async markUploaded(uuid) {
    let response = await this.collection.updateOne(
      {uuid}, 
      {$set: {uploaded: true}},
      {session: this.state?.session}
    );
    if (response.modifiedCount > 1) {
      throw new Error(`File.markUploaded: Modified: ${response.modifiedCount}.`);
    } 
    
  }

  async markPersisted(uuid) {

    let document = await this.collection.findOne(
      {uuid},
      {session: this.state.session}
    );
    if(!document) {
      throw new Util.InputError(`Cannot persist file ${uuid}. Does not exist`);
    }

    if(!document.uploaded) {
      throw new Util.InputError(`Cannot persist file ${uuid}. It has not yet been uploaded`);
    }

    let response = await this.collection.updateOne(
      {uuid}, 
      {$set: {persisted: true}},
      {session: this.state.session}
    );
    if (response.modifiedCount > 1) {
      throw new Error(`File.markPersisted: Modified: ${response.modifiedCount}.`);
    } 
  }

  // At the moment, the user is not allowed to delete the file directly.
  // Only a record can request a delete if it loses the reference to a file
  async deleteFile(uuid) {
    let file_metadata = await this.get(uuid);
    if(!file_metadata) {
      throw new Util.NotFoundError(`Cannot delete file ${uuid}. Does not exist`);
    }
    if(file_metadata.persisted) {
      throw new Util.InputError(`Cannot delete file as the record it has been attached to has already been persisted.`);
    }
    
    if(file_metadata.uploaded) {
      let file_path = path.join(Upload_Destination, uuid);
      await fsPromises.unlink(file_path);
    }
    let response = await this.collection.deleteMany(
      {uuid},
      {session: this.state.session}
    );
    if(response.deletedCount != 1) {
      throw new Error(`File.delete: Deleted: ${response.deletedCount}`);
    }
  }

  async existsWithParams(uuid, record_uuid, template_field_uuid) {
    let draft = await this.collection.findOne(
      {uuid, record_uuid, template_field_uuid},
      {session: this.state.session}
    );
    if(draft) {
      return true;
    }
    return false;
  }

  async get(uuid) {
    let cursor = await this.collection.find(
      {"uuid": uuid}, 
      {session: this.state.session}
    ).limit(1);
    if (!(await cursor.hasNext())) {
      return null;
    }
    return await cursor.next();
  }

}

export {
  collectionExport as collection,
  init,
  uploadDestination,
  Model as model
};