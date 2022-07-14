import { ObjectId } from "mongodb";
import assert from 'assert';

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

export function objectContainsUUID(object, uuid) {
  try {
    return object.uuid == uuid;
  } catch(err) {
    throw new InputError('Object provided is not a valid object');
  }
}

export function compareTimeStamp(a, b): number {
  return (new Date(a)).getTime() - (new Date(b)).getTime();
}

export function isPublic(public_date): boolean {
  return public_date && compareTimeStamp((new Date).getTime(), public_date);
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