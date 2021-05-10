var debug          = require('debug')('setup');
const TriboQueue   = require('../lib/tribo_lab.queue');
const Queue        = require('bull');
const JobData      = require('../models/job_data_model');
const JobNote      = require('../models/job_note_model');
const JobTag       = require('../models/job_tag_model');
const RunData      = require('../models/run_data_model');
const RunMetaData  = require('../models/run_meta_data_model');
const {Connection} = require('../lib/mongo_connection');
const {parse, stringify} = require('flatted/cjs');
var uuid = require('uuid/v1')
const httpstatus = require('http-status');
// var Promise      = require('bluebird');

/**
 * On adding to the queue should add the job job data and run meta
 * @param req
 * @param res
 * @returns {Promise<T>}
 */
exports.generateReportData = function (req, res) {
  const start_time = Date.now();
  return TriboQueue.add({
    jsonObject: req.body.data,
    command:    req.body.command,
    run_id:     req.body.run_id,
    start_time: start_time
  })
    .then(job => {
      // return res.status(200).send(job);
      let job_data      = new JobData(
        job.id,                                                               // Job Id
        req.body.command,                                                     // Job Type
        req.body.data,                                                        // Input Data
        req.body.command === "CalEhlBatch" ? req.body.data.LubData["19"] : 1, // Number of runs
        req.user !== undefined ? req.user.id : '1',
        req.body.run_cost || 1                                   // Run cost
      );
      let run_data      = new RunData(
        req.body.data,
        {},
        req.body.run_id,
        job.id
      );
      let run_meta_data = new RunMetaData(
        req.body.run_id,
        job.id,
        start_time,
        null,
        'waiting'
      );
      return Promise.all([
        job_data.save(),
        run_data.save(),
        run_meta_data.save()
      ])
    })
    .then(data_results => {
      return res.status(httpstatus.OK).send(data_results)
    })
    .catch(err => {
      debug(err)
      return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(err)
    })

};

/**
 * Adds a tag to a job.
 *
 * @param req
 * @param res
 * @returns {Promise<T | void>}
 */
exports.addTag = async function (req, res) {
  try {
    const user_id = req.user._id;
    let job_tag = new JobTag(
      req.body.job_id,
      user_id,
      req.body.tag
    );


    job_tag.save()
      .then(
        result => {
          console.log(`Successfully inserted item with _id: ${result.insertedId}`)
          job_tag._id = result.insertedId;
          return res.send(job_tag);
        })

  }
  catch (err) {
    debug('We got an error...' + err);
    return res.status(500).send(err)
  }
};


/**
 * Adds a note to a job.
 *
 * @param req
 * @param res
 * @returns {Promise<T | void>}
 */
exports.addNote = async function (req, res) {
  try {
    const user_id = req.user._id;
    let job_note = new JobNote(
      req.body.job_id,
      user_id,
      req.body.note
    );


    job_note.save()
      .then(
        result => {
          console.log(`Successfully inserted item with _id: ${result.insertedId}`)
          job_note._id = result.insertedId;
          return res.send(job_note);
        })

  }
  catch (err) {
    debug('We got an error...' + err);
    return res.status(500).send(err)
  }
};

exports.startReportProcessing = function (req, res) {
  const start_time = Date.now();
  const json_object = convertEHLData(req.body.data);
  const user_id = req.user._id;

  return TriboQueue.add({
    jsonObject: convertEHLData(req.body.data),
    command:      req.body.command,
    run_id:       uuid(),
    start_time:   start_time,
    job_id:       req.body.job_id,
    user_id:      user_id
  })
    .then(run => {
      let job_data      = new JobData(
        req.body.job_id,                                                    // Job Id
        req.body.command,                                                   // Job Type
        json_object,                                                        // Input Data
        req.body.command === "CalEhlBatch" ? json_object.LubData["19"] : 1, // Number of runs
        user_id,                                                            // User ID Required
        req.body.run_cost || 1,                                             // Run cost
        req.body.parent_id || ''
      );
      return job_data.save()
        .then((saved_job) => {
          debug('Job should have saved');
          debug(saved_job);
          return res.status(httpstatus.OK).send({job_id: req.body.job_id})
        })
        .catch((err) => {
          debug(err);
          return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(err)
        })

    })
    .catch(err => {
      return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(err)
    })
};

/**
 * Returns list of jobs that the user has created.
 * @param req
 * @param res
 * @returns {Promise<*|undefined|Request|void>}
 */
exports.getJobsForUser = async function (req, res) {
  const user_id = req.user._id;
  debug("USER ID from REQ: " + user_id);
  let limit     = 100;
  let offset    = 0;
  if (req.query.page) {
    limit  = parseInt(req.query.page.limit);
    offset = parseInt(req.query.page.offset);
  }
  const job_collection = Connection.db.collection(JobData.collection_name);
  // const job_note = Connection.db.collection(JobNote.collection_name);
  // const job_tag = Connection.db.collection(JobTag.collection_name);

  try {
    let jobs = await
      job_collection
        .aggregate([
          { $match: {
              $and: [
                {user_token: {$eq: user_id.toString()}},
                {archived: {$eq: false}}
              ]
            }
          },
          { "$addFields": { "JobId": { "$toString": "$_id" }}},
          { $lookup:
              {
                from: JobNote.collection_name,
                localField: 'JobId',
                foreignField: 'job_id',
                as: 'notes'
              }
          },
          { $lookup:
              {
                from: JobTag.collection_name,
                localField: 'JobId',
                foreignField: 'job_id',
                as: 'tags'
              }
          },
          /*
          {$unwind: '$notes'},
          {$sort:{'notes.create_date': -1}},
          {$group: {
            _id: '$_id',
            job_id: { $addToSet: '$job_id'},
            'notes': {$push: '$notes'}
          }},
          {$project: {
            _id: '$_id',
            'notes': '$notes'
          }},

           */
  ])
        .skip(offset)
        .limit(limit)
        .sort({date: -1})
        .toArray();


    return res.status(httpstatus.OK).send(jobs);
  } catch (e) {
    return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(e.stack);
  }
};

/**
 *
 * @param req.params.job_id
 * @param req.query.offset
 * @param req.query.limit
 * @param req.user.id
 * @param res
 * @returns {Promise<void>}
 */
exports.getRunsForJob = async function (req, res) {

  // const user_id    = req.user.id;
  let limit  = 0;
  let offset = 0;
  // if (req.query.limit && req.query.offset) {
  //   limit  = req.query.limit;
  //   offset = req.query.offset;
  // }
  // debug(req.params);
  // try {
  //
  //   return Connection.connectToMongo()
  //     .then(function () {
  //
  //   const job_collection      = Connection.db.collection(JobData.collection_name);
  //   const meta_run_collection = Connection.db.collection(RunMetaData.collection_name);
  //   const data = job_collection.find({job_id: req.params.job_id})
  //
  //     debug(data);
  //     // if (job.isEmpty) {
  //     //   throw new Error('You do not have permission to access this job!');
  //     // }
  //
  //     return Connection.db.collection(RunMetaData.collection_name)
  //       .find({job_id: req.params.job_id})
  //       .limit(limit)
  //       .skip(offset);
  //   })
  //   .then((run_metas) =>{
  //     debug(run_metas);
  //     return res.status(httpstatus.OK).send(run_metas)
  //
  //   })
  //   .catch((e) => {
  //     if (e.message === 'You do not have permission to access this job!') {
  //       return res.status(httpstatus.UNAUTHORIZED).send(e);
  //     }
  //     debug(e);
  //     return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(e);
  //   });
  //
  // }
  // catch (e) {
  //   debug(e);
  //   return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(e)
  // }

  // TODO Figure out why await isnt working with the classes
  try {
    const job_collection = Connection.db.collection(JobData.collection_name);
    const run_collection = Connection.db.collection(RunData.collection_name);
    debug(job_collection);
    let job = await job_collection.find({job_id: req.params.job_id}).toArray();

    if(job.isEmpty){
      throw new Error('You do not have permission to access this job!');
    }
    debug(job);
    let run_data = await
      run_collection.find({job_id: req.params.job_id})
      .limit(limit)
      .skip(offset)
      .toArray();

    let new_run_data = [];
    debug("These are the run metas");
    debug(run_data);
    for(let single_run_data of run_data) {
      single_run_data.input_data = convertEHLData(single_run_data.input_data);
      new_run_data.push(single_run_data);
    }

    return res.status(httpstatus.OK).send(new_run_data);
  }
  catch (e) {
    if(e.message === 'You do not have permission to access this job!') {
      return res.status(httpstatus.UNAUTHORIZED).send(e.stack);
    }
    debug(e.stack);
    return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(e.stack);
  }
};


  /**
   *
   * @param req.params.run_id
   * @param req.params.job_id
   * @param req.query.limit
   * @param req.query.offset
   * @param res
   */
  exports.getSpecificRunData = async function (req, res) {

    const user_id = req.user.id;
    let limit     = 0;
    let offset    = 0;
    if (req.query.limit && req.query.offset) {
      limit  = req.query.limit;
      offset = req.query.offset;
    }


    const job_collection = Connection.db.collection(JobData.collection_name);
    const run_collection = Connection.db.collection(RunData.collection_name);

    try {
      //Check if the user has access to the run
      let job = await job_collection.find({
        job_id:  req.params.job_id,
        user_id: user_id
      }).max(1);
      if (job.isEmpty) {
        throw new Error('You do not have permission to access this job!');
      }
      //Project should make it so only the graph output data is included
      let run_data = await run_collection
        .find({job_id: req.params.job_id})
        .project({output_data: 1})
        .limit(limit)
        .skip(offset);

      return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(run_data)


    } catch (e) {
      if (e.message === 'You do not have permission to access this job!') {
        return res.status(httpstatus.UNAUTHORIZED).send(e.stack);
      }
      return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(e.stack);
    }


  };

  /**
   *
   * @param req.params.graph_type
   * @param req.params.run_type
   * @param req.query.limit
   * @param req.query.offset
   * @param req.user.id
   * @param req
   * @param res
   */
  exports.getGraphData = async function (req, res) {
    const user_id = req.user.id;
    let limit     = 0;
    let offset    = 0;
    if (req.query.limit && req.query.offset) {
      limit  = req.query.limit;
      offset = req.query.offset;
    }

    const job_collection = Connection.db.collection(JobData.collection_name);

    try {

      if (req.query.limit !== undefined) {
        let jobs = await job_collection.find(
          //Query
          {
            user_id: user_id
          },
          //Options
          {
            limit: parseInt(limit, 10),
            skip:  parseInt(offset, 10)
          }
        )
        return res.send(jobs).status(httpstatus.OK)
      } else {

        let jobs = await job_collection.find(
          //Query
          {
            user_id: user_id
          }
        )
        return res.send(jobs).status(httpstatus.OK)
      }
    } catch (e) {
      return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(e.stack)
    }


  };

  exports.getJobsAndChildrenForUser = async function (req, res) {
    const user_id = req.user.id;
    const job_collection = Connection.db.colletion(JobData.collection_name);
    let jobs_with_parent_id = await job_collection.find(
      {
        user_id: user_id,
      }
    ).toArray();

    const tree_list = treeify(jobs_with_parent_id, 'job_id', 'parent_id');
    return res.status(httpstatus.OK).send(tree_list)
    //
  };

function treeify(list, idAttr, parentAttr, childrenAttr) {
  if (!idAttr) idAttr = 'id';
  if (!parentAttr) parentAttr = 'parent';
  if (!childrenAttr) childrenAttr = 'children';

  var treeList = [];
  var lookup = {};
  list.forEach(function(obj) {
    lookup[obj[idAttr]] = obj;
    obj[childrenAttr] = [];
  });
  list.forEach(function(obj) {
    if (obj[parentAttr] != null) {
      lookup[obj[parentAttr]][childrenAttr].push(obj);
    } else {
      treeList.push(obj);
    }
  });
  return treeList;
};

  exports.getReportData = function (req, res) {

    // TriboQueue.getJob(req.params.id)
    //   .then(job => {
    //     return job.finished()
    //   })
    //   .then(completed_job => {
    //     return res.status(httpstatus.OK).send(completed_job)
    //   })
    //   .catch(err => {
    //     debug(err)
    //     return res.status(httpstatus.INTERNAL_SERVER_ERROR).send(err)
    //   })
  };

  function convertEHLData(inputData) {
    // Data came from the web
    let data = {};
    if (inputData.RollerData === undefined) {
      const components = inputData.components;
      const dent       = inputData.surfaceDent;
      const load       = inputData.load;
      const roughness  = inputData.roughness;
      const domainMesh = inputData.domainMesh;
      const settings   = inputData.settings;
      const lubricant  = inputData.lubricant;
      const batchrun   = inputData.batchRun;

      data["RollerData"]    = {};
      data.RollerData["0"]  = components.roller_1.length;  // length
      data.RollerData["1"]  = components.roller_2.length;
      data.RollerData["2"]  = components.roller_1.smallEndRad;  // small end radius
      data.RollerData["3"]  = components.roller_2.smallEndRad; // larger end radius
      data.RollerData["4"]  = components.roller_1.largeEndRad;
      data.RollerData["5"]  = components.roller_2.largeEndRad;
      data.RollerData["6"]  = components.roller_1.elasticity; // Elasticity
      data.RollerData["7"]  = components.roller_2.elasticity;
      data.RollerData["8"]  = components.roller_1.poissonRatio; // Poisson Ratio
      data.RollerData["9"]  = components.roller_2.poissonRatio;
      data.RollerData["10"] = components.roller_1.density; // Density
      data.RollerData["11"] = components.roller_2.density;
      data.RollerData["12"] = components.roller_1.specHeat; // Specific Heat
      data.RollerData["13"] = components.roller_2.specHeat;
      data.RollerData["14"] = components.roller_1.thermConduct; // Thermal Conductivity
      data.RollerData["15"] = components.roller_2.thermConduct;
      data.RollerData["16"] = components.roller_1.thermExpansion; // Thermal Expansion
      data.RollerData["17"] = components.roller_2.thermExpansion;
      data.RollerData["18"] = components.roller_1.ambientTemp;  // Ambient
      data.RollerData["19"] = components.roller_2.ambientTemp;
      data.RollerData["20"] = components.roller_1.smallEndSpeed;  // Small End Speed
      data.RollerData["21"] = components.roller_2.smallEndSpeed;
      data.RollerData["22"] = components.roller_1.largeEndSpeed;  // Larger end Speed
      data.RollerData["23"] = components.roller_2.largeEndSpeed;
      data.RollerData["24"] = components.roller_1.axialProfile.crownRadius; // Crown Radius
      data.RollerData["25"] = components.roller_2.axialProfile.crownRadius;
      data.RollerData["26"] = components.roller_1.axialProfile.logarithmic;
      data.RollerData["27"] = "";  // Input Filename for axial profile 1
      data.RollerData["28"] = "";  // Input Filename for axial profile 2

      data["DentData"]   = {};
      data.DentData["0"] = dent.noDent;
      data.DentData["1"] = dent.dent.depth;  // Depth
      data.DentData["2"] = dent.dent.diameter;  // Diameter
      data.DentData["3"] = dent.dent.shoulderFactor;  // Shoulder Factor
      data.DentData["4"] = dent.dent.xPos;  // Xpos
      data.DentData["5"] = dent.dent.yPos;  // Ypos
      data.DentData["6"] = "";  // Dent input file X data
      data.DentData["7"] = "";  // Dent input file Y data

      data["LubData"]    = {};
      data.LubData["0"]  = lubricant.newtonian;
      data.LubData["1"]  = lubricant.solutionType;
      data.LubData["2"]  = lubricant.temp_1.temperature; // Temp
      data.LubData["3"]  = lubricant.temp_2.temperature;
      data.LubData["4"]  = lubricant.temp_1.viscosity; // Viscosity
      data.LubData["5"]  = lubricant.temp_2.viscosity;
      data.LubData["6"]  = lubricant.temp_1.pressureViscosityCoef;  // pressure viscosity
      data.LubData["7"]  = lubricant.temp_2.pressureViscosityCoef;
      data.LubData["8"]  = lubricant.temp_1.modulusG; // modulus
      data.LubData["9"]  = lubricant.temp_2.modulusG;
      data.LubData["10"] = lubricant.temp_1.slopeFactor; //Slope Factor
      data.LubData["11"] = lubricant.temp_2.slopeFactor;
      data.LubData["12"] = lubricant.viscosityTempCoef; // viscosity temp
      data.LubData["13"] = lubricant.specificHeat; // specific heat
      data.LubData["14"] = lubricant.thermalConductivity; // thermal conductivity
      data.LubData["15"] = lubricant.density; // density
      data.LubData["16"] = lubricant.densityTempCoef; // density thermal coeff
      data.LubData["17"] = inputData.batchRun.pmaxRange.from; // pmax range
      data.LubData["18"] = inputData.batchRun.pmaxRange.to;
      data.LubData["19"] = inputData.batchRun.numOfCases; // num cases

      data["SysData"]    = {};
      data.SysData["0"]  = load.misalignment;
      data.SysData["1"]  = load.frictionCoef;
      data.SysData["2"]  = load.force;
      data.SysData["3"]  = load.pMax;
      data.SysData["4"]  = domainMesh.nx; // domain mesh x
      data.SysData["5"]  = domainMesh.ny; // domain mesh y
      data.SysData["6"]  = domainMesh.nz; // domain mesh z
      data.SysData["7"]  = domainMesh.start; // domain size - start
      data.SysData["8"]  = domainMesh.end; // domain size - end
      data.SysData["9"]  = domainMesh.depth; // domain size - depth
      data.SysData["10"] = load.inputLoad;
      data.SysData["11"] = settings.subSurfaceStress;
      data.SysData["12"] = settings.thermoElasticEffect;
      data.SysData["13"] = settings.writeOutputFiles;
      data.SysData["14"] = "filename";
      data.SysData["15"] = roughness.stdDev; // stdev
      data.SysData["16"] = roughness.skewness; // skewness
      data.SysData["17"] = roughness.kurtosis; // kurtosis
      data.SysData["18"] = roughness.autocorrelationX; // autocorr x
      data.SysData["19"] = roughness.autocorrelationY; // autocorr y

      data["EHLres"]   = {};
      data.EHLres["0"] = lubricant.lubricatedFrictionCoef;
      data.EHLres["1"] = lubricant.avgFilmThickness;
      data.EHLres["2"] = lubricant.asperityContactRatio;
    } else {
      let temp                                   = {};
      temp.components = {};
      temp.components.roller_1 = {}
      temp.components.roller_1.axialProfile = {}
      temp.components.roller_2 = {}
      temp.components.roller_2.axialProfile = {}
      temp.components.roller_1.length                   = inputData.RollerData["0"];
      temp.components.roller_1.smallEndRad              = inputData.RollerData["2"];
      temp.components.roller_1.largeEndRad              = inputData.RollerData["4"];
      temp.components.roller_1.elasticity               = inputData.RollerData["6"];
      temp.components.roller_1.poissonRatio             = inputData.RollerData["8"];
      temp.components.roller_1.density                  = inputData.RollerData["10"];
      temp.components.roller_1.specHeat                 = inputData.RollerData["12"];
      temp.components.roller_1.thermConduct             = inputData.RollerData["14"];
      temp.components.roller_1.thermExpansion           = inputData.RollerData["16"];
      temp.components.roller_1.ambientTemp              = inputData.RollerData["18"];
      temp.components.roller_1.smallEndSpeed            = inputData.RollerData["20"];
      temp.components.roller_1.largeEndSpeed            = inputData.RollerData["22"];
      temp.components.roller_1.axialProfile.crownRadius = inputData.RollerData["24"];
      temp.components.roller_1.axialProfile.logarithmic = inputData.RollerData["26"];
      temp.components.roller_2.length                   = inputData.RollerData["1"];
      temp.components.roller_2.smallEndRad              = inputData.RollerData["3"];
      temp.components.roller_2.largeEndRad              = inputData.RollerData["5"];
      temp.components.roller_2.elasticity               = inputData.RollerData["7"];
      temp.components.roller_2.poissonRatio             = inputData.RollerData["9"];
      temp.components.roller_2.density                  = inputData.RollerData["11"];
      temp.components.roller_2.specHeat                 = inputData.RollerData["13"];
      temp.components.roller_2.thermConduct             = inputData.RollerData["15"];
      temp.components.roller_2.thermExpansion           = inputData.RollerData["17"];
      temp.components.roller_2.ambientTemp              = inputData.RollerData["19"];
      temp.components.roller_2.smallEndSpeed            = inputData.RollerData["21"];
      temp.components.roller_2.largeEndSpeed            = inputData.RollerData["23"];
      temp.components.roller_2.axialProfile.crownRadius = inputData.RollerData["25"];

      temp.surfaceDent = {};
      temp.surfaceDent.dent = {};
      temp.surfaceDent.noDent              = inputData.DentData['0'];
      temp.surfaceDent.dent.depth          = inputData.DentData['1'];
      temp.surfaceDent.dent.diameter       = inputData.DentData['2'];
      temp.surfaceDent.dent.shoulderFactor = inputData.DentData['3'];
      temp.surfaceDent.dent.xPos           = inputData.DentData['4'];
      temp.surfaceDent.dent.yPos           = inputData.DentData['5'];

      temp.lubricant = {};
      temp.lubricant.temp_1 = {};
      temp.lubricant.temp_2 = {};
      temp.lubricant.newtonian                    = inputData.LubData["0"];
      temp.lubricant.solutionType                 = inputData.LubData["1"];
      temp.lubricant.temp_1.temperature           = inputData.LubData["2"]; // Temp
      temp.lubricant.temp_2.temperature           = inputData.LubData["3"];
      temp.lubricant.temp_1.viscosity             = inputData.LubData["4"]; // Viscosity
      temp.lubricant.temp_2.viscosity             = inputData.LubData["5"];
      temp.lubricant.temp_1.pressureViscosityCoef = inputData.LubData["6"];  // pressure viscosity
      temp.lubricant.temp_2.pressureViscosityCoef = inputData.LubData["7"];
      temp.lubricant.temp_1.modulusG              = inputData.LubData["8"]; // modulus
      temp.lubricant.temp_2.modulusG              = inputData.LubData["9"];
      temp.lubricant.temp_1.slopeFactor           = inputData.LubData["10"]; //Slope Factor
      temp.lubricant.temp_2.slopeFactor           = inputData.LubData["11"];
      temp.lubricant.viscosityTempCoef            = inputData.LubData["12"]; // viscosity temp
      temp.lubricant.specificHeat                 = inputData.LubData["13"]; // specific heat
      temp.lubricant.thermalConductivity          = inputData.LubData["14"]; // thermal conductivity
      temp.lubricant.density                      = inputData.LubData["15"]; // density
      temp.lubricant.densityTempCoef              = inputData.LubData["16"]; // density thermal coeff

      temp.batchRun = {};
      temp.batchRun.pmaxRange = {};
      temp.batchRun.pmaxRange.from                = inputData.LubData["17"]; // pmax range
      temp.batchRun.pmaxRange.to                  = inputData.LubData["18"];
      temp.batchRun.numOfCases                    = inputData.LubData["19"]; // num cases

      temp.load = {};
      temp.load.misalignment            = inputData.SysData["0"];
      temp.load.frictionCoef            = inputData.SysData["1"];
      temp.load.force                   = inputData.SysData["2"];
      temp.load.pMax                    = inputData.SysData["3"];

      temp.domainMesh = {};
      temp.domainMesh.nx                = inputData.SysData["4"]; // domain mesh
      temp.domainMesh.ny                = inputData.SysData["5"]; // domain mesh
      temp.domainMesh.nz                = inputData.SysData["6"]; // domain msh z
      temp.domainMesh.start             = inputData.SysData["7"]; // domai size - start
      temp.domainMesh.end               = inputData.SysData["8"]; // domain ize - end
      temp.domainMesh.depth             = inputData.SysData["9"]; // domai size - depth
      temp.load.inputLoad               = inputData.SysData["10"];

      temp.settings = {};
      temp.settings.subSurfaceStress    = inputData.SysData["11"];
      temp.settings.thermoElasticEffect = inputData.SysData["12"];
      temp.settings.writeOutputFiles    = inputData.SysData["12"];

      temp.roughness = {};
      temp.roughness.stdDev             = inputData.SysData["12"];
      temp.roughness.skewness           = inputData.SysData["12"];
      temp.roughness.kurtosis           = inputData.SysData["12"];
      temp.roughness.autocorrelationX   = inputData.SysData["12"];
      temp.roughness.autocorrelationY   = inputData.SysData["12"];

      temp.lubricant.lubricatedFrictionCoef = inputData.EHLres["0"];
      temp.lubricant.avgFilmThickness       = inputData.EHLres["1"];
      temp.lubricant.asperityContactRatio   = inputData.EHLres["2"];

      data = temp
    }
    return data
  }

// # self.SysData = [
// #     tk.StringVar(value='0'),  # Misalignment
// #     tk.StringVar(value='0.15'),  # Dry friction coefficient
// #     tk.StringVar(value='5720'),  # Total load (N)
// #     tk.StringVar(value='0'),  # Target maximum contact pressure
// #     tk.StringVar(value='128'),  # Number of blanket cells in X direction, flow direction
// #     tk.StringVar(value='64'),  # Number of blanket cells in Y direction, roller axial direction
// #     tk.StringVar(value='32'),  # Number of points in Z direction for subsurface stress calculation
// #     tk.StringVar(value='2.5'),  # Start of domain as coefficient of semi-width contact
// #     tk.StringVar(value='1.5'),  # End of domain as coefficient of semi-width contact
// #     tk.StringVar(value='3'),  # Depth of domain as coefficient of semi-width contact
// #     tk.StringVar(value='F'),  # Given input load (Force or Pressure)
// #     tk.StringVar(value='N'),  # Subsurface stress calculation (Yes or No)
// #     tk.StringVar(value='N'),  # Thermo-elastic effect calculation (Yes or No)
// #     tk.StringVar(value='N'),  # Write output files (Yes or No)
// #     tk.StringVar(value='filename'),  # Output filename
// #     tk.StringVar(value='0.1'),  # Standard Deviation (micron)
// #     tk.StringVar(value='0.0'),  # Skewness
// #     tk.StringVar(value='3.0'),  # Kurtosis
// #     tk.StringVar(value='200'),  # Autocorrelation X (micron)
// #     tk.StringVar(value='httpstatus.INTERNAL_SERVER_ERROR')  # Autocorrelation Y (micron)
// # ]
// #
// # self.EHLres = [
// #     tk.StringVar(value=''),  # Lubricated friction coefficient
// #     tk.StringVar(value=''),  # Average film thickness
// #     tk.StringVar(value='')  # Ratio of asperity contact
// # ]

