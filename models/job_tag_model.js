const MongoModel       = require("./mongo_model");
const {Connection}     = require('../lib/mongo_connection.js');

class JobTag extends MongoModel {

  constructor(job_id, user_id, tag, tag_id) {
    super();
    this._id              = tag_id || null;
    this.job_id           = job_id;
    this.user_id          = user_id;
    this.tag              = tag;
    this.create_date      = Date.now();
  }

  initialize() {
    return Connection.db.createCollection(this.collection_name, {
      validator: {
        $jsonSchema: {
          bsonType:   "object",
          required:   [
            "job_id",
            "user_id",
            "tag"
          ],
          properties: {
            job_id:         {
              bsonType: "string"
            },
            user_id:         {
              bsonType: "string"
            },
            tag: {
              bsonType: "string"
            },
            create_date: {
              bsonType: "int"
            },
            delete_date: {
              bsonType: "int"
            }
          }
        }
      }
    })
  }

  save() {
    if(this._id !== null) {
      return Connection.db.collection(JobTag.collection_name).updateOne(
        { _id: this._id },
        {
          $set: {
            job_id:          this.job_id,
            user_id:         this.user_id,
            tag:             this.tag,
            create_date:     this.create_date,
            delete_date:     this.delete_date || 0
          }
        },
        {
          "upsert": true
        }
      )
    }
    else {
      return Connection.db.collection(JobTag.collection_name).insertOne(
        {
          job_id:          this.job_id,
          user_id:         this.user_id,
          tag:             this.tag,
          create_date:     this.create_date,
          delete_date:     this.delete_date || 0
        }
      )
    }
  }

}

JobTag.collection_name = "job_tag";

module.exports = JobTag;

