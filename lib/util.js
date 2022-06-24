const ObjectId = require('mongodb').ObjectId;

exports.isObject = function(object) {
  return typeof object === 'object' && object !== null && !Array.isArray(object);
}

exports.arrayEqual = function(array1, array2) {
  if (!Array.isArray(array1) || !Array.isArray(array2)) {
    throw `One of the inputs to arrayEqual is not an array: ${array1}, ${array2}`
  }
  if (array1.length != array2.length) {
    return false;
  }
  array1 = [...array1].sort();
  array2 = [...array2].sort();
  for(let i = 0; i < array1.length; i++) {
    if (array1[i] != array2[i]) {
      return false;
    }
  }
  return true;
}

exports.objectContainsUUID = function(object, uuid) {
  try {
    return object.uuid == uuid;
  } catch(err) {
    throw new InputError('Object provided is not a valid object');
  }
}

const compareTimeStamp = function(a, b) {
  return (new Date(a)).getTime() - (new Date(b)).getTime();
}
exports.compareTimeStamp = compareTimeStamp;

exports.isPublic = function(public_date) {
  return public_date && compareTimeStamp((new Date).getTime(), public_date);
}

exports.datesEqual = function(d1, d2) {
  if (d1 == d2) {
    return true;
  }
  if (d1 != undefined && d2 != undefined && d1.getTime() === d2.getTime()) {
    return true;
  }
  return false;
}

exports.anyDuplicateInArray = function(array) {
  return new Set(array).size !== array.length
}

exports.objectIdsSetDifference = function(list1, list2) {
  let list2_set = new Set();
  for(let _id of list2) {
    list2_set.add(_id.toString());
  }
  let set_difference = [];
  for(let _id of list1) {
    if(!list2_set.has(_id.toString())) {
      set_difference.push(_id);
    }
  }
  return set_difference;
}

exports.objectIdsSetUnion = function(list1, list2) {
  let list1_strings = list1.map(x => x.toString());
  let list2_strings = list2.map(x => x.toString());
  let union = [...new Set([...list1_strings, ...list2_strings])]
  return union.map(x => new ObjectId(x));
}

exports.initializeState = function(req) {
  let state = {};
  state.user_id = req.user ? req.user._id  : null;
  return state;
}

function InputError(message) {
  this.name = 'InputError';
  this.message = message;
  this.stack = (new Error()).stack;
}
InputError.prototype = new Error;

function NotFoundError(message) {
  this.name = 'NotFoundError';
  this.message = message;
  this.stack = (new Error()).stack;
}
NotFoundError.prototype = new Error;

function PermissionDeniedError(message) {
  this.name = 'PermissionDeniedError';
  this.message = message;
  this.stack = (new Error()).stack;
}
PermissionDeniedError.prototype = new Error;

exports.InputError = InputError;
exports.NotFoundError = NotFoundError;
exports.PermissionDeniedError = PermissionDeniedError;