const debug = require('debug')('setup');
const MongoModel = require('./mongo_model');
const DataProcessQueue = require('../lib/data_process.queue');
const { Connection } = require('../lib/mongo_connection.js');


class RunData extends MongoModel {

  constructor(input_data, output_data, run_id, job_id) {
    super();
    this.run_id = run_id;
    this.job_id = job_id;
    this.input_data = input_data;
    this.output_data = output_data;
  }

  initialize() {
    return Connection.db.createCollection(this.collection_name, {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["input_data", "output_data", "run_id", "job_id"],
          properties: {
            input_data: {
              bsonType: "object"
            },
            output_data: {
              bsonType: "object"
            },
            run_id: {
              bsonType: "string"
            },
            job_id: {
              bsonType: "string"
            }
          },
        }
      }
    })
  }

  /**
   * Format the data and add it to the queue to be stored. Should be all formatted so that the queue only
   * needs to grab the collection and the data.
   */
  save() {
    return DataProcessQueue.add({collection: RunData.collection_name, type: 'upsert', data: this.objectBuilder()})
  }

  objectBuilder() {
    return {
      run_id: this.run_id,
      job_id: this.job_id,
      input_data: this.input_data,
      output_data: this.output_data || {}
    }
  }

}

RunData.collection_name = "run_data";

module.exports = RunData;

