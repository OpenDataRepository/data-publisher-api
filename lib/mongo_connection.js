const MongoClient = require('mongodb').MongoClient;
const env = process.env.NODE_ENV || 'production';
const config = require('../config/config')[env];
const debug = require('debug')('setup');

// class Connection {
//   static connectToMongo() {
//     if ( this.db ) return Promise.resolve(this.db);
//     debug('mongo setup');
//     return MongoClient.connect(this.url, this.options)
//       .then(client => {
//         this.client = client;
//         this.db = client.db(config.mongo_server.db_name);
//         const run_data = new RunData(this.db, {}, {}, {}, {});
//         const run_meta_data = new RunMetaData(this.db);
//         const job_data = new JobData(this.db);
//         return Promise.all([run_data.initialize(), run_meta_data.initialize(), job_data.initialize()])
//       })
//       .then(result => {
//         debug('mongo promises run');
//         return;
//       })
//       .catch(function (err) {
//         debug(err)
//       })
//   }
// }

class Connection {
  static connectToMongo() {
    if ( this.db ) {
      debug('Mongo is already connected.');
      return Promise.resolve(this.db)
    }
    return MongoClient.connect(this.url, this.options)
      .then(client => {
        debug('Mongo connection established.');
        this.db = client.db(Connection.db_name)
      })
  }
}

Connection.client = null;
Connection.db = null;
Connection.url = config.mongo_server.uri + ":" + config.mongo_server.port;
Connection.db_name = config.mongo_server.db_name;
Connection.options = {
  bufferMaxEntries:   0,
  reconnectTries:     5000,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  poolSize: 10
};

module.exports = { Connection };
