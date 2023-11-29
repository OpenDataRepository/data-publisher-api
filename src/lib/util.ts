import { ObjectId } from "mongodb";
import assert from 'assert';
const MongoDB = require('./mongoDB');

export function isObject(object): boolean {
  return typeof object === 'object' && object !== null && !Array.isArray(object);
}

export function arrayEqual(array1: any[], array2: any[]): boolean {
  assert(Array.isArray(array1) && Array.isArray(array2), 
  `One of the inputs to arrayEqual is not an array: ${array1}, ${array2}`);
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

export function objectsEqual(obj1, obj2) {
  if(!obj1 && !obj2) {
    return true;
  }
  if(!obj1 || !obj2) {
    return false;
  }
  // Check if the objects have the same keys
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) {
    return false;
  }

  // Recursively compare the properties
  for (let key of keys1) {
    const val1 = obj1[key];
    const val2 = obj2[key];
    if (typeof val1 === 'object' && typeof val2 === 'object') {
      if (!objectsEqual(val1, val2)) {
        return false;
      }
    } else if (val1 !== val2) {
      return false;
    }
  }

  return true;
}

export function objectContainsUUID(object, uuid) {
  try {
    return object.uuid == uuid;
  } catch(err) {
    throw new InputError('Object provided is not a valid object');
  }
}

export function isTimeAAfterB(a, b): boolean {
  if((typeof(a) != 'string' && !(a instanceof Date)) ||
    (typeof(b) != 'string' && !(b instanceof Date))
  ) {
    throw new Error(`isTimeAAfterB: input must be a string in date format or date object`);
  }
  if(typeof(a) == 'string') {
    a = new Date(a);
  }
  if(typeof(b) == 'string') {
    b = new Date(b);
  }
  return (a.getTime() - (b.getTime())) > 0;
}

export function isPublic(public_date): boolean {
  return public_date && isTimeAAfterB(new Date(), public_date);
}

export function isDateValid(date): boolean {
  return !isNaN(Date.parse(date));
}

export function datesEqual(d1, d2): boolean {
  if (d1 == d2) {
    return true;
  }
  if (d1 != undefined && d2 != undefined && d1.getTime() === d2.getTime()) {
    return true;
  }
  return false;
}

export function anyDuplicateInArray(array: any[]) {
  return new Set(array).size !== array.length
}

export function arrayUnion(array1: any[], array2: any[]): any[] {
  assert(Array.isArray(array1) && Array.isArray(array2), 
  `One of the inputs to arrayEqual is not an array: ${array1}, ${array2}`);
  return [...new Set([...array1, ...array2])]
}

export function objectIdsSetUnion(list1: ObjectId[], list2: ObjectId[]): ObjectId[] {
  let list1_strings = list1.map(x => x.toString());
  let list2_strings = list2.map(x => x.toString());
  let union = arrayUnion(list1_strings, list2_strings);
  return union.map(x => new ObjectId(x));
}

export function arraySetDifference(array1: any[], array2: any[]): any[] {
  return [...new Set([...array1].filter(x => !array2.includes(x)))];
}

export function objectIdsSetDifference(list1: ObjectId[], list2: ObjectId[]): ObjectId[] {
  let list1_strings = list1.map(x => x.toString());
  let list2_strings = list2.map(x => x.toString());
  let difference = arraySetDifference(list1_strings, list2_strings);
  return difference.map(x => new ObjectId(x));
}

export function initializeState(req) {
  let state: Record<string, any> = {};
  state.user_id = req.user ? req.user._id  : null;
  return state;
}

export function convertToMongoId(_id: string | ObjectId): ObjectId {
  if(typeof(_id) === 'string') {
    if(!ObjectId.isValid(_id)) {
      throw new Util.InputError(`Invalid _id provided: ${_id}`);
    }
    return new ObjectId(_id);
  } else {
    return _id
  }
}

export const executeWithTransaction = async (state, callback) => {
  if(state.session) {
    return callback();
  }
  const session = MongoDB.newSession();
  state.session = session;
  let result;
  try {
    await session.withTransaction(async () => {
      try {
        result = await callback();
      } catch(err) {
        await session.abortTransaction();
        throw err;
      }
    });
    session.endSession();
    delete state.session;
    return result;
  } catch(err) {
    session.endSession();
    delete state.session;
    throw err;
  }
}

export function recursiveLog(object: any) {
  console.log(JSON.stringify(object, null, 2));
}

export function InputError(message?) {
  this.name = 'InputError';
  this.message = message;
  this.stack = (new Error()).stack;
}
InputError.prototype = new Error;

export function NotFoundError(message?) {
  this.name = 'NotFoundError';
  this.message = message;
  this.stack = (new Error()).stack;
}
NotFoundError.prototype = new Error;

export function PermissionDeniedError(message?) {
  this.name = 'PermissionDeniedError';
  this.message = message;
  this.stack = (new Error()).stack;
}
PermissionDeniedError.prototype = new Error;