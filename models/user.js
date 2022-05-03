const MongoDB = require('../lib/mongoDB');
const SharedFunctions = require('./shared_functions');

var User;

async function collection() {
  if (User === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('users');
    } catch(e) {}
    User = db.collection('users');
  }
  return User;
}
exports.collection = function() {
  return User;
}

exports.init = async function() {
  User = await collection();
}

exports.create = async function(username, password) {
  let existing = await User.findOne({username});
  if(existing) {
    throw new Error('Username already exists');
  }
  let response = await User.insertOne(
    {username, password}
  );
  if (!response.acknowledged) {
    throw new Error(`User.create: Failed to insert user with username: ${username} and password: ${password}`);
  }
}

exports.getByUsername = async function(username) {
  return await User.findOne(
    {username}
  );
}

exports.getBy_id = async function(_id) {
  _id = SharedFunctions.convertToMongoId(_id);
  return await User.findOne({_id});
}