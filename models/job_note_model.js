const MongoModel       = require("./mongo_model");
const {Connection}     = require('../lib/mongo_connection.js');

class JobNote extends MongoModel {

  constructor(job_id, user_id, note, note_id) {
    super();
    this._id              = note_id || null;
    this.job_id           = job_id;
    this.user_id          = user_id;
    this.note             = note;
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
            "note"
          ],
          properties: {
            job_id: {
              bsonType: "string"
            },
            user_id: {
              bsonType: "string"
            },
            note: {
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
      return Connection.db.collection(JobNote.collection_name).updateOne(
        { _id: this._id },
        {
          $set: {
            job_id:          this.job_id,
            user_id:         this.user_id,
            note:            this.note,
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
      return Connection.db.collection(JobNote.collection_name).insertOne(
        {
            job_id:          this.job_id,
            user_id:         this.user_id,
            note:            this.note,
            create_date:     this.create_date,
            delete_date:     this.delete_date || 0
        }
      )
    }
  }

}

JobNote.collection_name = "job_note";

module.exports = JobNote;

