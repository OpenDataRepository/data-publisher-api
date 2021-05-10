const Queue = require('bull');
const debug = require('debug')('setup');
const env = process.env.NODE_ENV || 'production';
const config = require(__dirname + '/../config/config.json')[env];
const RunMetaData = require('../models/run_meta_data_model');
const RunData = require('../models/run_data_model');
const JobData = require('../models/job_data_model');
const pythonQueue = new Queue('tribo_lab', 'redis://' + config.redis_server.ip_address + ':' + config.redis_server.port);
pythonQueue.process(__dirname + '/python_processor.js');


//Should fire up another queue that adds the resultant job data to mongo.
//On completion should add the run_data
pythonQueue.on('completed', function (job, result) {
  debug('job completed');
  debug(job.data)
  debug(result)
  const run_meta_data = new RunMetaData(
    job.data.run_id,
    job.data.job_id,
    job.data.start_time,
    Date.now(),
    'completed'
  );

  const run_data = new RunData(
    job.data.jsonObject,
    result,
    job.data.run_id,
    job.data.job_id
  )
  return run_meta_data.save()
    .then(() => {return run_data.save()})
    .catch((err) => {
      debug(err)
    })

})

pythonQueue.on('error', function (error) {
  debug('job errored');
  debug(error);
  // return res.status(500).send(error)
  // return dataProcessQueue.add({status: 'error', error: error });
})

pythonQueue.on('failed', function(job, err) {

  // return dataProcessQueue.add({initial_params: job, result_data: result, status: 'failed', error: err});
})

pythonQueue.on('stalled', function (job) {

  // return dataProcessQueue.add({initial_params: job, status: 'stalled'});
})


module.exports = pythonQueue;
