const request = require("supertest");
const fs = require('fs');
const path = require('path');
var { app, init: appInit } = require('../app');
var finalhandler = require('finalhandler')
var http = require('http')
var serveStatic = require('serve-static')

var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

const uploadFileDirect = async (uuid, file) => {
  return await request(app)
    .post(`/file/${uuid}/direct`)
    .attach('file', file);
}
const uploadFileFromUrl = async (uuid, url) => {
  return await request(app)
    .post(`/file/${uuid}/fromUrl`)
    .send({url});
}

const getFile = async (uuid) => {
  return await request(app)
    .get(`/file/${uuid}`);
}

const dynamicTestFilesPath = __dirname + '/test_data/dynamic_files'
const uploadsDirectoryPath = __dirname + "/../uploads"
const clearFilesAtPath = (directory) => {
  fs.readdir(directory, (err, files) => {
    if (err) throw err;
  
    for (let file of files) {
      fs.unlink(path.join(directory, file), err => {
        if (err) throw err;
      });
    }
  });
};

beforeEach(async() => {
  clearFilesAtPath(dynamicTestFilesPath);
  clearFilesAtPath(uploadsDirectoryPath);
});

afterAll(async () => {
  clearFilesAtPath(dynamicTestFilesPath);
  clearFilesAtPath(uploadsDirectoryPath);
});

test("Upload a file directly", async () => {
  let new_file_path = path.join(dynamicTestFilesPath, "toUpload.txt");
  let originalFileContents = 'Hey there!';
  fs.writeFileSync(new_file_path, originalFileContents);
  let uuid = "aUuid";

  await Helper.testAndExtract(uploadFileDirect, uuid, new_file_path);

  let response = await getFile(uuid);
  expect(response.statusCode).toBe(200);
  let newFileBuffer = response.body;
  let newFileContents = newFileBuffer.toString();
  expect(newFileContents).toEqual(originalFileContents);
});

test("Upload a file from url", async () => {
  let new_file_path = path.join(dynamicTestFilesPath, "toUpload.txt");
  let originalFileContents = 'Hey there!';
  fs.writeFileSync(new_file_path, originalFileContents);
  let uuid = "aUuid";

  // Serve up public/ftp folder
  var serve = serveStatic(dynamicTestFilesPath);
  // Create server
  var server = http.createServer(function onRequest (req, res) {
    serve(req, res, finalhandler(req, res))
  });
  // Listen
  server.listen(3000);

  let url = "http://localhost:3000/toUpload.txt"
  let response = await uploadFileFromUrl(uuid, url);
  server.close();
  expect(response.statusCode).toBe(200);

  response = await getFile(uuid);
  expect(response.statusCode).toBe(200);
  let newFileBuffer = response.body;
  let newFileContents = newFileBuffer.toString();
  expect(newFileContents).toEqual(originalFileContents);
});