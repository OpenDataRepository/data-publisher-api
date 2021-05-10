const Queue = require('bull');
const debug = require('debug')('setup');
const env = process.env.NODE_ENV || 'production';
const config = require(__dirname + '/../config/config.json')[env];
const dataProcessQueue = new Queue('data_queue', 'redis://' + config.redis_server.ip_address + ':' + config.redis_server.port);
dataProcessQueue.process( __dirname + '/data_processor.js');

//Just says that the job is complete
dataProcessQueue.on('completed', function (job, result) {
  // debug('job completed');
})

dataProcessQueue.on('error', function (error) {
  // debug('job errored');
  debug(error);
  throw error
  // return res.status(500).send(error)
})

dataProcessQueue.on('failed', function (job, error) {
  // debug('job failed');
  debug(error);
  throw error
})

module.exports = dataProcessQueue;
