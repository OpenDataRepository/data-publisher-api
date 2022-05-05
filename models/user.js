const MongoDB = require('../lib/mongoDB');
const SharedFunctions = require('./shared_functions');
const Util = require('../lib/util');

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

exports.create = async function(email, password) {
  let existing = await User.findOne({email});
  if(existing) {
    throw new Util.InputError('email already exists');
  }
  let response = await User.insertOne(
    {email, password}
  );
  if (!response.acknowledged) {
    throw new Error(`User.create: Failed to insert user with email: ${email} and password: ${password}`);
  }
}

exports.getByEmail = async function(email) {
  return await User.findOne(
    {email}
  );
}

exports.getBy_id = async function(_id) {
  _id = SharedFunctions.convertToMongoId(_id);
  return await User.findOne({_id});
}

exports.delete = async function(_id) {
  _id = SharedFunctions.convertToMongoId(_id);
  let response = await User.deleteMany(
    {_id}
  );
  if(response.deletedCount != 1) {
    throw new Error(`Deleted ${response.deletedCount} accounts with _id: ${_id}`);
  }
}