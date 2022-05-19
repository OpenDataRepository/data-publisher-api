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

exports.create = async function(email, password, session) {
  let existing = await User.findOne({email});
  if(existing) {
    throw new Util.InputError('email already exists');
  }
  let response = await User.insertOne(
    {email, password, confirmed: false},
    {session}
  );
  if (!response.acknowledged) {
    throw new Error(`User.create: Failed to insert user with email: ${email} and password: ${password}`);
  }
  return response.insertedId;
}

exports.confirmEmail = async function(user_id) {
  user_id = SharedFunctions.convertToMongoId(user_id);
  let response = await User.updateOne(
    {_id: user_id},
    {
      $set: {confirmed: true}
    }
  );
  if(response.matchedCount != 1) {
    throw new Error(`User.confirmEmail: matched ${response.matchedCount} accounts with _id: ${user_id}`);
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

exports.update = async function(_id, input_update_properties) {
  _id = SharedFunctions.convertToMongoId(_id);
  let filtered_update_properties = {};
  if(input_update_properties.first_name) {
    filtered_update_properties.first_name = input_update_properties.first_name;
  }
  if(input_update_properties.last_name) {
    filtered_update_properties.last_name = input_update_properties.last_name;
  }
  if(input_update_properties.password) {
    filtered_update_properties.password = input_update_properties.password;
  }
  let response = await User.updateOne(
    {_id},
    {
      $set: input_update_properties
    }
  );
  if(response.matchedCount != 1) {
    throw new Error(`Updated: matched ${response.matchedCount} accounts with _id: ${_id}`);
  }
}