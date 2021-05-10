const MongoModel       = require("./mongo_model");
const DataProcessQueue = require('../lib/data_process.queue');
const {Connection}     = require('../lib/mongo_connection.js');

class JobData extends MongoModel {

  constructor(
    job_id,
    job_run_type,
    input_data,
    num_runs,
    user_token,
    run_cost,
    run_stars,
    parent_id,
    job_name,
    job_description,
    project_name
  ) {
    super();
    this.job_id            = job_id;
    this.job_run_type      = job_run_type;
    this.input_data        = input_data;
    this.num_runs          = num_runs;
    this.user_token        = user_token;
    this.run_cost          = run_cost;
    this.run_stars         = run_stars || -1;
    this.date              = Date.now();
    this.parent_id         = parent_id;
    this.job_name          = job_name || '';
    this.job_description   = job_description || '';
    this.project_name      = project_name || '';
  }

  initialize() {
    return Connection.db.createCollection(this.collection_name, {
      validator: {
        $jsonSchema: {
          bsonType:   "object",
          required:   [
            "job_id",
            "job_run_type",
            "input_data",
            "number_of_runs",
            "user_token",
            "run_cost"
          ],
          properties: {
            job_id:         {
              bsonType: "string"
            },
            job_run_type:   {
              bsonType: "string"
            },
            job_name: {
              bsonType: "string"
            },
            job_description: {
              bsonType: "string"
            },
            project_name: {
              bsonType: "string"
            },
            input_data:     {
              bsonType: "object"
            },
            number_of_runs: {
              bsonType: "int"
            },
            user_token:     {
              bsonType: "string"
            },
            run_cost:       {
              bsonType: "int"
            },
            run_stars:       {
              bsonType: "int"
            },
            date:           {
              bsonType: "int"
            },
            parent_id: {
              bsonType: "string"
            },
            archived: {
              bsonType: "bool"
            }
          },
        }
      }
    })
  }

  save() {
    return DataProcessQueue.add({
      collection: JobData.collection_name,
      type: 'upsert',
      data: this.objectBuilder()
    })
  }

  objectBuilder() {
    return {
      job_id:             this.job_id.toString(),
      job_run_type:       this.job_run_type.toString(),
      input_data:         this.input_data,
      number_of_runs:     this.num_runs || 1,
      user_token:         this.user_token,
      run_cost:           this.run_cost || 1,
      run_stars:          this.run_stars || -1,
      date:               this.date,
      parent_id:          this.parent_id || '',
      job_name:           this.job_name || '',
      job_description:    this.job_description || '',
      project_name:       this.project_name || '',
      archived:           this.archived || false
    }
  }

}

JobData.collection_name = "job_data";

module.exports = JobData;

