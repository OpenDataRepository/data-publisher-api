const { spawn } = require('child_process');
const debug = require('debug')('setup');

/**
 * Threaded queue processor, uses child process to spin up a python instance of the tribolab file.
 * @param job - The bull instance as well as the input data for the python file.
 * @returns {Promise<TriboLabData>} - Passes a promise containing the output from the python file.
 */
module.exports = function (job) {

  let pythonPromise = new Promise((resolve, reject) => {
    //spin up a python child process
    const triboLabTerminal = spawn('python3.7', [ __dirname + '/TriboLabTerminal.py', JSON.stringify(job.data.jsonObject), job.data.command]);
    let data_final         = '';

    debug(JSON.stringify(job.data.jsonObject))

    triboLabTerminal.stdout.on('data', (data) => {

      data_final += Buffer.from(data, 'hex').toString('utf8');
    });

    triboLabTerminal.stderr.on('data', (data) => {

      debug('in python processor error')
      debug(Buffer.from(data, 'hex').toString('utf8'));
      reject(data);
    });

    triboLabTerminal.on('close', (code) => {
      let index  = data_final.indexOf('\n');
      data_final = data_final.substring(index + 1);
      data_final = JSON.parse(data_final)
      resolve(data_final)
    })
  });

  return pythonPromise.then(function (result) {
    debug('promise result')
    // debug(result)
    return result
  })
    .catch(function (err) {
      throw err
    })

};
