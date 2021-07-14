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

exports.isValidDate = function(d) {
  return d instanceof Date && !isNaN(d);
}

exports.objectContainsUUID = function(object, uuid) {
  try {
    return object.uuid == uuid;
  } catch(err) {
    throw new InputError('Object provided is not a valid object');
  }
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

exports.InputError = InputError;
exports.NotFoundError = NotFoundError;