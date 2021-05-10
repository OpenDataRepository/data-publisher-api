const MongoModel = require('./mongo_model');
const DataProcessQueue = require('../lib/data_process.queue');
const { Connection } = require('../lib/mongo_connection.js');

class RunMetaData extends MongoModel {


  constructor(run_id, job_id, start_time, completion_time, status) {
    super();
    this.run_id = run_id;
    this.job_id = job_id;
    this.start_time = start_time;
    this.completion_time = completion_time;
    this.status = status;
  }

  initialize() {
    return Connection.db.createCollection(this.collection_name, {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["run_id", "job_id", "start_time", "status"],
          properties: {
            run_id: {
              bsonType: "string"
            },
            job_id: {
              bsonType: "string"
            },
            start_time: {
              bsonType: "long"
            },
            status: {
              bsonType: "string"
            },
            completion_time: {
              bsonType: "long"
            }
          },
        }
      }
  })
  }

  save() {
    return DataProcessQueue.add({collection: RunMetaData.collection_name, type: "upsert", data: this.objectBuilder()})
      // .catch(err => {
      //   throw err
      // })
  }

  // getData() {
  //   Connection.db.
  // }

  objectBuilder() {
    return {
      job_id: this.job_id.toString(),
      run_id: this.run_id.toString(),
      start_time: this.start_time,
      completion_time: this.completion_time === null ? undefined : this.completion_time,
      status: this.status.toString()
    }
  }

}

RunMetaData.collection_name = "run_meta_data";

module.exports = RunMetaData;
