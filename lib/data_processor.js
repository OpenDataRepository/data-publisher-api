const debug = require('debug')('setup');
const { Connection } = require('./mongo_connection');

module.exports = function (job) {
  //
  // let dataPromise = new Promise((resolve, reject) => {
  //   resolve('done');
  // })
  //
  // return dataPromise
  // debug('collection');
  // debug(job.data.collection);
  // debug('this is the job data');
  // debug(job.data.data);
  return Connection.connectToMongo()
    .then(db => {
      debug(job.data);
      return Connection.db.collection(job.data.collection).updateOne(
        {
          job_id: job.data.data.job_id
        },
        {
          $set: job.data.data
        },
        {
          upsert: job.data.type === 'upsert'
        }
      );
    })
    .catch(err => {
      debug(err);
      throw err
    })
};

//   return dataProcessQueue.add({initial_params: job, result_data: result, status: 'complete'});
// })
//
// pythonQueue.on('error', function (error) {
//   debug('job errored');
//   debug(error);
//   // return res.status(500).send(error)
//   return dataProcessQueue.add({status: 'error', error: error });
// })
//
// pythonQueue.on('failed', function(job, err) {
//
//   return dataProcessQueue.add({initial_params: job, result_data: result, status: 'failed', error: err});
// })
//
// pythonQueue.on('stalled', function (job) {
//
//   return dataProcessQueue.add({initial_params: job, status: 'stalled'});
// })
//
//
// module.exports = pythonQueue;
