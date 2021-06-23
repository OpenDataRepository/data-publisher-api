exports.isObject = function(object) {
  return typeof object === 'object' && object !== null;
}

exports.arrayEqual = function(array1, array2) {
  if (!Array.isArray(array1) || !Array.isArray(array2) || (array1.length != array2.length)) {
    return false;
  }
  array1 = [...array1].sort();
  array2 = [...array2].sort();
  for(let i = 0; i < array1.length; i++) {
    if (!array1[i].equals(array2[i])) {
      return false;
    }
  }
  return true;
}

exports.isValidDate = function(d) {
  return d instanceof Date && !isNaN(d);
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