var expect        = require("chai").expect;
var superagent    = require("superagent");
var debug         = require("debug")("python");
var env           = process.env.NODE_ENV || "development";
const testconfig    = require(__dirname + '/../config/config.mocha.json')[env]
const apiserver = testconfig.baseurl

const streaks = ['5', '10', '25', '50', '75', '100', '125', '150', '175', '200']
const streak_types = ['_generic', '_4 foot', '_6 foot', '_8 foot']
var status = require('http-status')

let data_result = {}
let data = {}
let data_id = 0;

data["RollerData"] = {};
data.RollerData["0"] = "10";  // length
data.RollerData["1"] = "10";
data.RollerData["2"] = "20";  // small end radius
data.RollerData["3"] = "2.0e9"; // larger end radius
data.RollerData["4"] = "20";
data.RollerData["5"] = "2.0e9";
data.RollerData["6"] = "206000"; // Elasticity
data.RollerData["7"] = "206000";
data.RollerData["8"] = "0.3"; // Poisson Ratio
data.RollerData["9"] = "0.3";
data.RollerData["10"] = "7850"; // Density
data.RollerData["11"] = "7850";
data.RollerData["12"] = "460"; // Specific Heat
data.RollerData["13"] = "460";
data.RollerData["14"] = "47"; // Thermal Conductivity
data.RollerData["15"] = "47";
data.RollerData["16"] = "1.17e-5"; // Thermal Expansion
data.RollerData["17"] = "1.17e-5";
data.RollerData["18"] = "40";  // Ambient
data.RollerData["19"] = "40";
data.RollerData["20"] = "2.2";  // Small End Speed
data.RollerData["21"] = "1.8";
data.RollerData["22"] = "2.2";  // Larger end Speed
data.RollerData["23"] = "1.8";
data.RollerData["24"] = "2.0e9"; // Crown Radius
data.RollerData["25"] = "2.0e9";
data.RollerData["26"] = "C";
data.RollerData["27"] = "";  // Logarithmic??
data.RollerData["28"] = "";  // Input File??

data["DentData"] = {};
data.DentData["0"] = "NoDent";
data.DentData["1"] = "";  // Depth
data.DentData["2"] = "";  // Diameter
data.DentData["3"] = "";  // Shoulder Factor
data.DentData["4"] = "";  // Xpos
data.DentData["5"] = "";  // Ypos
data.DentData["6"] = "";  // Dent input file??
data.DentData["7"] = "";  // Dent input file??

data["LubData"] = {};
data.LubData["0"] = "Nw";
data.LubData["1"] = "N";
data.LubData["2"] = "40"; // Temp
data.LubData["3"] = "100";
data.LubData["4"] = "0.1749"; // Viscosity
data.LubData["5"] = "0.01742";
data.LubData["6"] = "2.273e-8";  // pressure viscosity
data.LubData["7"] = "1.614e-8";
data.LubData["8"] = ""; // modulus
data.LubData["9"] = ""; // slope factor
data.LubData["10"] = "";
data.LubData["11"] = "";
data.LubData["12"] = "0.0411"; // viscosity temp
data.LubData["13"] = "1880"; // specific heat
data.LubData["14"] = "0.14"; // thermal conductivity
data.LubData["15"] = "890"; // density
data.LubData["16"] = "6.4e-4"; // density thermal coeff
data.LubData["17"] = "300"; // pmax range
data.LubData["18"] = "1500";
data.LubData["19"] = "5"; // num cases

data["SysData"] = {};
data.SysData["0"] = "0";
data.SysData["1"] = "0.15";
data.SysData["2"] = "5720";
data.SysData["3"] = "0";
data.SysData["4"] = "128"; // domain mesh x
data.SysData["5"] = "64"; // domain mesh y
data.SysData["6"] = "32"; // domain mesh z
data.SysData["7"] = "2.5"; // domain size - start
data.SysData["8"] = "1.5"; // domain size - end
data.SysData["9"] = "3"; // domain size - depth
data.SysData["10"] = "F";
data.SysData["11"] = "N";
data.SysData["12"] = "N";
data.SysData["13"] = "N";
data.SysData["14"] = "filename";
// Roughness
data.SysData["15"] = "0.1"; // stdev
data.SysData["16"] = "0.0"; // skewness
data.SysData["17"] = "3.0"; // kurtosis
data.SysData["18"] = "200"; // autocorr x
data.SysData["19"] = "500"; // autocorr y

data["EHLres"] = {};
data.EHLres["0"] = "";
data.EHLres["1"] = "";
data.EHLres["2"] = "";
const run_id = parseInt(Math.random() * 10000000).toString();
const run_id_2 = parseInt(Math.random() * 10000000).toString();
let run_data = {};
let job_id = 0;
describe("Should test the python terminal program and queue system", function () {
  it("Starts the queue and waits till the job completes", function () {

    return superagent.post(apiserver + "/model/")
      .set("Content-Type", "application/json")
      .send({data : data, command: 'CalDryCont', run_id: run_id})
      .then(result => {
        data_result = JSON.parse(result.text)
        expect(result.status).to.eql(status.OK)
      })
      .catch(err => {
        throw err
      })

  })
  it('should start the job and get a job id back', function () {

    return superagent.post(apiserver + "/model/start")
      .set("Content-Type", "application/json")
      .send({data : data, command: 'CalDryCont', run_id: run_id})
      .then(result => {
        data_id = parseInt(result.text)
        expect(result.status).to.eql(status.OK)

      })
      .catch(err => {
        throw err
      })
  });
  it('should wait till the job completes', function () {
    debug(data_id)
    return superagent.get(apiserver + "/model/" + data_id)
      .then(result => {
        // debug(result);
        expect(result.status).to.eql(status.OK);
        expect(result.body['x-axis'].length).to.equal(128);
        expect(result.body['y-axis'].length).to.equal(64);
      })
  });

  //TODO Need to add the proper auth statements here
  it('should get the jobs for a user', function () {
    superagent.get(apiserver + "/model/jobs")
      .auth('user')
      .then(res => {
        expect(res.status).to.eql(status.OK)
        expect(res.data.length).to.not.eql(0)

      })
  })
  //TODO Need to add the proper auth statements here
  it('should get the jobs for a user', function () {
    superagent.get(apiserver + "/model/jobs/" + run_id)
      .auth('user')
      .then(res => {
        expect(res.status).to.eql(status.OK)
        expect(res.data.length).to.not.eql(0)
        job_id = res.data[0].job_id
      })
  })
  //TODO Need to add the proper auth statements here
  it('should get the jobs for a user', function () {
    superagent.get(apiserver + "/model/jobs/" + run_id + "/" + job_id)
      .auth('user')
      .then(res => {
        expect(res.status).to.eql(status.OK);
        expect(res.data.length).to.not.eql(0)
      })
  })
  // it('should test wet contact', function () {
  //
  //   return superagent.post("localhost:3000/users/")
  //     .set("Content-Type", "application/json")
  //     .send({data : data, command: 'CalEHLCont'})
  //     .then(function (result) {
  //       data_result = JSON.parse(result.text)
  //
  //     })
  //     .catch(function (err) {
  //       throw err
  //     })
  // });
});

